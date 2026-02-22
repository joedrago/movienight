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
    Class UIWebView = NSClassFromString(@"UIWebView");
    if (UIWebView) {
        _webView = [[UIWebView alloc] initWithFrame:self.bounds];
        NSLog(@"[MovieNight] Created UIWebView");

        // Try to configure media playback settings
        @try {
            [_webView setValue:@YES forKey:@"mediaPlaybackRequiresUserAction"];
            NSLog(@"[MovieNight] Set mediaPlaybackRequiresUserAction=YES");
        } @catch (NSException *e) {}
        @try {
            [_webView setValue:@YES forKey:@"allowsInlineMediaPlayback"];
            NSLog(@"[MovieNight] Set allowsInlineMediaPlayback=YES");
        } @catch (NSException *e) {}
    }

    if (_webView) {
        _webView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;

        // Inject viewport-fit=cover so web content fills the entire screen
        NSString *viewportJS = @"(function(){"
            "var m=document.querySelector('meta[name=viewport]');"
            "if(!m){m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);}"
            "var c=m.content||'';"
            "if(c.indexOf('viewport-fit')===-1){m.content=c+(c?',':'')+'viewport-fit=cover';}"
            "})();";

        // We'll inject this after page load via evaluateJavaScript instead of user scripts

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

    // UIWebView: stringByEvaluatingJavaScriptFromString:
    SEL uiSel = NSSelectorFromString(@"stringByEvaluatingJavaScriptFromString:");
    if ([_webView respondsToSelector:uiSel]) {
        @try {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
            [_webView performSelector:uiSel withObject:js];
#pragma clang diagnostic pop
        } @catch (NSException *e) {
            NSLog(@"[MovieNight] JS eval exception: %@", e);
        }
    }
}

@end
