import UIKit
import Capacitor
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}


class ReceiptBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(ReceiptPrinterPlugin())
    }
}

@objc(ReceiptPrinterPlugin)
public class ReceiptPrinterPlugin: CAPPlugin, CAPBridgedPlugin, WKNavigationDelegate, UIPrintInteractionControllerDelegate {
    public let identifier = "ReceiptPrinterPlugin"
    public let jsName = "ReceiptPrinter"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "print", returnType: CAPPluginReturnPromise)]
    private var printing = false
    private var receiptView: WKWebView?
    private var pendingPrint: CAPPluginCall?
    private var paperSize: CGSize?
    @objc func print(_ call: CAPPluginCall) {
        guard let html = call.getString("html"), html.utf8.count <= 1_000_000 else { call.reject("Invalid receipt"); return }
        DispatchQueue.main.async {
            guard !self.printing, let view = self.bridge?.viewController?.view else { call.reject("Printing unavailable"); return }
            self.printing = true
            self.pendingPrint = call
            if let width = call.getDouble("paperWidthMm"), width == 58,
               let height = call.getDouble("paperHeightMm"), height.isFinite, height > 0, height <= 5000 {
                self.paperSize = CGSize(width: width * 72 / 25.4, height: height * 72 / 25.4)
            } else {
                self.paperSize = nil
            }
            let configuration = WKWebViewConfiguration()
            configuration.defaultWebpagePreferences.allowsContentJavaScript = false
            let webView = WKWebView(frame: CGRect(x: -10000, y: 0, width: self.paperSize == nil ? 300 : 58 * 96 / 25.4, height: 1), configuration: configuration)
            webView.navigationDelegate = self
            view.addSubview(webView)
            self.receiptView = webView
            webView.loadHTMLString(html, baseURL: nil)
        }
    }
    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let call = pendingPrint, let view = bridge?.viewController?.view else { cleanup(); return }
            let controller = UIPrintInteractionController.shared
            let info = UIPrintInfo(dictionary: nil)
            info.jobName = call.getString("title") ?? "Receipt"
            info.outputType = .general
            controller.printInfo = info
            controller.delegate = self
            // A web-view formatter preserves the inline vector QR as well as text.
            let formatter = webView.viewPrintFormatter()
            formatter.perPageContentInsets = .zero
            controller.printFormatter = formatter
            let completion: UIPrintInteractionController.CompletionHandler = { _, _, error in
                self.cleanup()
                if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
            }
            if UIDevice.current.userInterfaceIdiom == .pad {
                controller.present(from: view.bounds, in: view, animated: true, completionHandler: completion)
            } else {
                controller.present(animated: true, completionHandler: completion)
            }
    }
    public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        pendingPrint?.reject(error.localizedDescription); cleanup()
    }
    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        pendingPrint?.reject(error.localizedDescription); cleanup()
    }
    public func printInteractionController(_ printInteractionController: UIPrintInteractionController, choosePaper paperList: [UIPrintPaper]) -> UIPrintPaper {
        UIPrintPaper.bestPaper(forPageSize: paperSize ?? CGSize(width: 595, height: 842), withPapersFrom: paperList)
    }
    private func cleanup() {
        receiptView?.removeFromSuperview(); receiptView = nil
        pendingPrint = nil; paperSize = nil; printing = false
    }
}
