import UIKit
import MediaPlayer

class WebViewController: UIViewController {
    private var tvWebView: TVWebView!
    private var lastSeekTime: TimeInterval = 0
    private static let seekThrottleInterval: TimeInterval = 0.5

    override var preferredFocusEnvironments: [UIFocusEnvironment] {
        return [tvWebView]
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        // Ignore safe area to fill the entire screen
        view.insetsLayoutMarginsFromSafeArea = false
        additionalSafeAreaInsets = .zero

        tvWebView = TVWebView(frame: view.bounds)
        tvWebView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(tvWebView)

        let urlString = Bundle.main.infoDictionary?["WebViewURL"] as? String ?? "http://localhost:3000"
        if let url = URL(string: urlString) {
            tvWebView.load(url)
        }

        // Inject custom subtitle renderer to replace native <track> elements,
        // which crash UIWebView's WebCore on tvOS when a cue ends.
        injectSubtitleOverride()

        // Intercept the play/pause remote command so it doesn't directly
        // control the <video> element. Instead, inject it as a Space keypress.
        let commandCenter = MPRemoteCommandCenter.shared()
        commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
            self?.injectKeyEvent("keydown", key: " ")
            self?.injectKeyEvent("keyup", key: " ")
            return .success
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        tvWebView.frame = view.bounds
    }

    // MARK: - Siri Remote → Keyboard event injection

    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        for press in presses {
            // Down arrow toggles subtitles when video is playing and subs are loaded
            if press.type == .downArrow {
                let js = """
                    (function() {
                        var iframe = document.querySelector('iframe');
                        var video = iframe && iframe.contentDocument && iframe.contentDocument.querySelector('video');
                        if (video && !video.paused && window._tvosSubsHaveCues && window._tvosSubsHaveCues()) {
                            window._tvosToggleSubs();
                            return 'toggled';
                        }
                        return '';
                    })();
                    """
                // evaluateJavaScript is synchronous for UIWebView, but we can't read
                // the return value easily. Use a flag approach instead.
                tvWebView.evaluateJavaScript("""
                    (function() {
                        var iframe = document.querySelector('iframe');
                        var video = iframe && iframe.contentDocument && iframe.contentDocument.querySelector('video');
                        if (video && !video.paused && window._tvosSubsHaveCues && window._tvosSubsHaveCues()) {
                            window._tvosToggleSubs();
                        } else {
                            var evt = new KeyboardEvent('keydown', {key:'ArrowDown', bubbles:true});
                            var target = document.activeElement || document;
                            target.dispatchEvent(evt);
                            document.dispatchEvent(evt);
                            if (iframe && iframe.contentWindow) {
                                iframe.contentWindow.postMessage({type:'key', event:'keydown', key:'ArrowDown'}, '*');
                            }
                        }
                    })();
                    """)
                return
            }

            if let key = keyForPress(press) {
                // Throttle seek keys to avoid crashing UIWebView's media pipeline
                if key == "ArrowLeft" || key == "ArrowRight" {
                    let now = ProcessInfo.processInfo.systemUptime
                    if now - lastSeekTime < Self.seekThrottleInterval {
                        return
                    }
                    lastSeekTime = now
                }
                injectKeyEvent("keydown", key: key)
                return
            }
        }
        super.pressesBegan(presses, with: event)
    }

    override func pressesEnded(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        for press in presses {
            // Down arrow keyup: just swallow it (toggle already happened in pressesBegan)
            if press.type == .downArrow {
                return
            }
            if let key = keyForPress(press) {
                injectKeyEvent("keyup", key: key)
                return
            }
        }
        super.pressesEnded(presses, with: event)
    }

    private func keyForPress(_ press: UIPress) -> String? {
        switch press.type {
        case .select:      return " "           // Space
        case .playPause:   return " "           // Space
        case .menu:        return "Escape"
        case .upArrow:     return "ArrowUp"
        case .downArrow:   return "ArrowDown"
        case .leftArrow:   return "ArrowLeft"
        case .rightArrow:  return "ArrowRight"
        @unknown default:  return nil
        }
    }

    private func injectSubtitleOverride() {
        // Wait for iframe to exist, then patch it. Re-check periodically
        // since the iframe is created after room selection.
        Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] timer in
            guard let self = self else { timer.invalidate(); return }
            let js = """
                (function() {
                    if (window._subsPatched) return;
                    var iframe = document.querySelector('iframe');
                    if (!iframe || !iframe.contentDocument) return;
                    var doc = iframe.contentDocument;
                    if (!doc.querySelector('video')) return;
                    window._subsPatched = true;

                    // Parse VTT text into array of {start, end, text}
                    function parseVTT(text) {
                        var cues = [];
                        var blocks = text.replace(/\\r/g, '').split('\\n\\n');
                        for (var i = 0; i < blocks.length; i++) {
                            var lines = blocks[i].trim().split('\\n');
                            for (var j = 0; j < lines.length; j++) {
                                var m = lines[j].match(/(\\d+[:\\.]\\S+)\\s+-->\\s+(\\d+[:\\.]\\S+)/);
                                if (m) {
                                    var textLines = lines.slice(j + 1).join('\\n');
                                    if (textLines) {
                                        cues.push({start: parseTm(m[1]), end: parseTm(m[2]), text: textLines});
                                    }
                                    break;
                                }
                            }
                        }
                        return cues;
                    }
                    function parseTm(s) {
                        var p = s.replace(',', '.').split(':');
                        if (p.length === 2) return parseFloat(p[0]) * 60 + parseFloat(p[1]);
                        return parseFloat(p[0]) * 3600 + parseFloat(p[1]) * 60 + parseFloat(p[2]);
                    }

                    // Create overlay div for custom subs
                    var overlay = doc.createElement('div');
                    overlay.id = '_tvos_subs';
                    overlay.style.cssText = 'position:absolute;bottom:60px;left:0;right:0;text-align:center;pointer-events:none;z-index:4;font-size:2.0em;color:#dd6;text-shadow:2px 2px 4px #000,-2px -2px 4px #000;';
                    var container = doc.getElementById('videoContainer');
                    if (container) container.appendChild(overlay);

                    var cues = [];
                    var subsOn = true;
                    var video = doc.querySelector('video');

                    // Override appendChild on the video to intercept <track> elements
                    var origAppend = HTMLElement.prototype.appendChild;
                    video.appendChild = function(child) {
                        if (child.tagName === 'TRACK') {
                            var vttUrl = child.src;
                            // Fetch and parse the VTT ourselves
                            var xhr = new XMLHttpRequest();
                            xhr.open('GET', vttUrl, true);
                            xhr.onload = function() {
                                if (xhr.status === 200) {
                                    cues = parseVTT(xhr.responseText);
                                }
                            };
                            xhr.send();
                            // Don't add the native track - return child to satisfy callers
                            return child;
                        }
                        return origAppend.call(this, child);
                    };

                    // Override removeChild for subsTrackDom cleanup
                    video.removeChild = function(child) {
                        if (child.tagName === 'TRACK') {
                            cues = [];
                            overlay.textContent = '';
                            return child;
                        }
                        return HTMLElement.prototype.removeChild.call(this, child);
                    };

                    // Handle any <track> elements already on the video (e.g. joined existing room)
                    var origRemove = HTMLElement.prototype.removeChild;
                    var existingTracks = video.querySelectorAll('track');
                    for (var i = 0; i < existingTracks.length; i++) {
                        var tr = existingTracks[i];
                        if (tr.src) {
                            (function(vttUrl) {
                                var xhr = new XMLHttpRequest();
                                xhr.open('GET', vttUrl, true);
                                xhr.onload = function() {
                                    if (xhr.status === 200) {
                                        cues = parseVTT(xhr.responseText);
                                    }
                                };
                                xhr.send();
                            })(tr.src);
                        }
                        origRemove.call(video, tr);
                    }
                    // Also disable any native text tracks that may have been created
                    if (video.textTracks) {
                        for (var i = 0; i < video.textTracks.length; i++) {
                            video.textTracks[i].mode = 'disabled';
                        }
                    }

                    // Override toggleSubs in iframe and expose on parent
                    function doToggleSubs() {
                        subsOn = !subsOn;
                        if (!subsOn) overlay.innerHTML = '';
                    }
                    if (iframe.contentWindow) {
                        iframe.contentWindow.toggleSubs = doToggleSubs;
                    }
                    window._tvosToggleSubs = doToggleSubs;
                    window._tvosSubsHaveCues = function() { return cues.length > 0; };

                    // Render loop - small lookahead to compensate for currentTime lag
                    var LOOKAHEAD = 0.15;
                    function renderSubs() {
                        if (video && subsOn && cues.length > 0) {
                            var t = video.currentTime + LOOKAHEAD;
                            var html = '';
                            for (var i = 0; i < cues.length; i++) {
                                if (t >= cues[i].start && t <= cues[i].end) {
                                    html += cues[i].text.replace(/</g, '&lt;').replace(/\\n/g, '<br>');
                                }
                            }
                            overlay.innerHTML = html;
                        } else {
                            if (overlay.innerHTML !== '') overlay.innerHTML = '';
                        }
                        requestAnimationFrame(renderSubs);
                    }
                    requestAnimationFrame(renderSubs);
                })();
                """
            self.tvWebView.evaluateJavaScript(js)
        }
    }

    private func injectKeyEvent(_ type: String, key: String) {
        let js = """
            (function() {
                try {
                    var evt = new KeyboardEvent('\(type)', {key:'\(key)', bubbles:true});
                    var iframe = document.querySelector('iframe');
                    if (iframe && iframe.contentWindow) {
                        iframe.contentWindow.postMessage({type:'key', event:'\(type)', key:'\(key)'}, '*');
                    }
                    var target = document.activeElement || document;
                    target.dispatchEvent(evt);
                    document.dispatchEvent(evt);
                } catch(e) {}
            })();
            """
        tvWebView.evaluateJavaScript(js)
    }
}
