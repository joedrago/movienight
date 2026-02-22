import UIKit
import MediaPlayer

class WebViewController: UIViewController {
    private var tvWebView: TVWebView!

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
            NSLog("[MovieNight] pressesBegan type=%ld", press.type.rawValue)
            if let key = keyForPress(press) {
                NSLog("[MovieNight] injecting keydown key=%@", key)
                injectKeyEvent("keydown", key: key)
                return
            }
        }
        super.pressesBegan(presses, with: event)
    }

    override func pressesEnded(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        for press in presses {
            NSLog("[MovieNight] pressesEnded type=%ld", press.type.rawValue)
            if let key = keyForPress(press) {
                NSLog("[MovieNight] injecting keyup key=%@", key)
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

    private func injectKeyEvent(_ type: String, key: String) {
        let js = """
            (function() {
                var evt = new KeyboardEvent('\(type)', {key:'\(key)', bubbles:true});
                var iframe = document.querySelector('iframe');
                if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.postMessage({type:'key', event:'\(type)', key:'\(key)'}, '*');
                }
                var target = document.activeElement || document;
                target.dispatchEvent(evt);
                document.dispatchEvent(evt);
            })();
            """
        tvWebView.evaluateJavaScript(js)
    }
}
