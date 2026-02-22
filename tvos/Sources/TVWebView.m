#import "TVWebView.h"

@implementation TVWebView {
    UIView *_webView;
}

- (instancetype)initWithFrame:(CGRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        [self setupWebView];
    }
    return self;
}

- (void)setupWebView {
    // Try WKWebView first (private on tvOS but present at runtime)
    Class WKWebViewConfiguration = NSClassFromString(@"WKWebViewConfiguration");
    Class WKWebView = NSClassFromString(@"WKWebView");
    NSLog(@"[MovieNight] WKWebView=%@, WKWebViewConfiguration=%@", WKWebView, WKWebViewConfiguration);

    if (WKWebView && WKWebViewConfiguration) {
        id config = [[WKWebViewConfiguration alloc] init];
        [config setValue:@YES forKey:@"allowsInlineMediaPlayback"];
        // 0 = no user action required (allows autoplay)
        [config setValue:@0 forKey:@"mediaTypesRequiringUserActionForPlayback"];

        id prefs = [config valueForKey:@"preferences"];
        if (prefs) {
            [prefs setValue:@YES forKey:@"javaScriptEnabled"];
        }

        // Inject viewport-fit=cover so web content fills the entire screen
        NSString *js = @"(function(){"
            "var m=document.querySelector('meta[name=viewport]');"
            "if(!m){m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);}"
            "var c=m.content||'';"
            "if(c.indexOf('viewport-fit')===-1){m.content=c+(c?',':'')+'viewport-fit=cover';}"
            "})();";

        Class WKUserScript = NSClassFromString(@"WKUserScript");
        if (WKUserScript) {
            SEL scriptInit = NSSelectorFromString(@"initWithSource:injectionTime:forMainFrameOnly:");
            id script = [WKUserScript alloc];
            NSMethodSignature *scriptSig = [script methodSignatureForSelector:scriptInit];
            if (scriptSig) {
                NSInvocation *inv = [NSInvocation invocationWithMethodSignature:scriptSig];
                [inv setTarget:script];
                [inv setSelector:scriptInit];
                [inv setArgument:&js atIndex:2];
                NSInteger injectionTime = 1; // WKUserScriptInjectionTimeAtDocumentEnd
                [inv setArgument:&injectionTime atIndex:3];
                BOOL mainFrameOnly = YES;
                [inv setArgument:&mainFrameOnly atIndex:4];
                [inv invoke];
                CFTypeRef scriptResult;
                [inv getReturnValue:&scriptResult];
                if (scriptResult) {
                    id userScript = (__bridge_transfer id)scriptResult;
                    id controller = [config valueForKey:@"userContentController"];
                    if (controller) {
                        SEL addSel = NSSelectorFromString(@"addUserScript:");
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
                        [controller performSelector:addSel withObject:userScript];
#pragma clang diagnostic pop
                    }
                }
            }
        }

        // -[WKWebView initWithFrame:configuration:]
        SEL initSel = NSSelectorFromString(@"initWithFrame:configuration:");
        id webView = [WKWebView alloc];
        NSMethodSignature *sig = [webView methodSignatureForSelector:initSel];
        if (sig) {
            NSInvocation *inv = [NSInvocation invocationWithMethodSignature:sig];
            [inv setTarget:webView];
            [inv setSelector:initSel];
            CGRect f = self.bounds;
            [inv setArgument:&f atIndex:2];
            [inv setArgument:&config atIndex:3];
            [inv invoke];
            CFTypeRef result;
            [inv getReturnValue:&result];
            if (result) {
                _webView = (__bridge_transfer UIView *)result;
            }
        }
    }

    // Fallback: UIWebView (also private on tvOS)
    if (!_webView) {
        Class UIWebView = NSClassFromString(@"UIWebView");
        if (UIWebView) {
            _webView = [[UIWebView alloc] initWithFrame:self.bounds];
        }
    }

    if (_webView) {
        _webView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;

        // Disable content inset adjustment so the web view ignores safe area
        UIScrollView *scrollView = [_webView valueForKey:@"scrollView"];
        if (scrollView) {
            scrollView.panGestureRecognizer.allowedTouchTypes = @[@(UITouchTypeIndirect)];
            scrollView.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;
        }

        [self addSubview:_webView];
    }
}

- (BOOL)canBecomeFocused {
    return YES;
}

- (NSArray<id<UIFocusEnvironment>> *)preferredFocusEnvironments {
    if (_webView) return @[_webView];
    return @[];
}

- (void)loadURL:(NSURL *)url {
    if (!_webView || !url) return;

    NSURLRequest *request = [NSURLRequest requestWithURL:url];

    SEL loadSel = NSSelectorFromString(@"loadRequest:");
    if ([_webView respondsToSelector:loadSel]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
        [_webView performSelector:loadSel withObject:request];
#pragma clang diagnostic pop
    }
}

- (void)evaluateJavaScript:(NSString *)js {
    if (!_webView) return;

    // WKWebView: evaluateJavaScript:completionHandler:
    SEL wkSel = NSSelectorFromString(@"evaluateJavaScript:completionHandler:");
    if ([_webView respondsToSelector:wkSel]) {
        NSMethodSignature *sig = [_webView methodSignatureForSelector:wkSel];
        if (sig) {
            NSInvocation *inv = [NSInvocation invocationWithMethodSignature:sig];
            [inv setTarget:_webView];
            [inv setSelector:wkSel];
            [inv setArgument:&js atIndex:2];
            id nilBlock = nil;
            [inv setArgument:&nilBlock atIndex:3];
            [inv invoke];
        }
        return;
    }

    // UIWebView: stringByEvaluatingJavaScriptFromString:
    SEL uiSel = NSSelectorFromString(@"stringByEvaluatingJavaScriptFromString:");
    if ([_webView respondsToSelector:uiSel]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
        [_webView performSelector:uiSel withObject:js];
#pragma clang diagnostic pop
    }
}

@end
