#import <UIKit/UIKit.h>

/// Wrapper around WKWebView/UIWebView loaded via private API on tvOS.
/// Uses NSClassFromString to avoid linking WebKit (which is absent from the tvOS SDK).
@interface TVWebView : UIView

- (void)loadURL:(NSURL *)url;
- (void)evaluateJavaScript:(NSString *)js;

@end
