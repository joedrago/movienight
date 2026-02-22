# MovieNight tvOS

Minimal tvOS app that displays the MovieNight web app fullscreen via WKWebView.

## Prerequisites

- Xcode with tvOS SDK (17.0+)
- XcodeGen: `brew install xcodegen`
- Apple Developer account (for physical device deployment)

## Build

```sh
# Build for physical Apple TV
make build

# Build for tvOS Simulator
make simulator
```

## Set the URL

Default is `http://localhost:3000`. Override with:

```sh
make build WEBVIEW_URL='http://192.168.1.100:3000'
```

## Development Team

For device builds, set your team ID one of two ways:

```sh
# Via file (persists across builds)
echo "XXXXXXXXXX" > ~/.appledevid

# Via command line
make build DEVELOPMENT_TEAM=XXXXXXXXXX
```

## Deploy to Apple TV

```sh
make install WEBVIEW_URL='http://192.168.1.100:3000'
```

If you have multiple devices, specify one:

```sh
xcrun devicectl list devices
make install DEVICE_ID=00000000-0000000000000000
```

## Notes

- WKWebView is not a public API on tvOS but exists in the SDK and works for sideloaded/dev builds.
- The Siri Remote touchpad is configured to work with the web page via `panGestureRecognizer.allowedTouchTypes`.
- App Transport Security is disabled to allow loading from local network HTTP servers.
