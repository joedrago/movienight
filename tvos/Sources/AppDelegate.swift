import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // Catch uncaught ObjC exceptions
        NSSetUncaughtExceptionHandler { exception in
            NSLog("[MovieNight] UNCAUGHT EXCEPTION: %@", exception)
            NSLog("[MovieNight] Stack: %@", exception.callStackSymbols.joined(separator: "\n"))
        }

        // Catch crash signals
        for sig: Int32 in [SIGTRAP, SIGABRT, SIGILL, SIGSEGV, SIGBUS] {
            signal(sig) { s in
                NSLog("[MovieNight] SIGNAL %d received", s)
                Thread.callStackSymbols.forEach { NSLog("[MovieNight] %@", $0) }
                // Re-raise to let the system handle it
                signal(s, SIG_DFL)
                raise(s)
            }
        }

        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = WebViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}
