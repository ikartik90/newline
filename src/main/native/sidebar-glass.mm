// AppKit's own sidebar glass, laid under the page's sidebar.
//
// macOS draws Finder's sidebar as the sidebar item of an NSSplitViewController.
// This lays one such split view at the bottom of an Electron window, below the
// page, with its sidebar exactly as wide as the page's: where the page is clear
// over its sidebar, AppKit's sidebar shows through, drawn by AppKit itself. The
// split view's other side lies under the note pane, which the page paints solid.
//
// Built by scripts/build-native.mjs; loaded by src/main/sidebar-glass.ts.

#import <AppKit/AppKit.h>
#import <objc/runtime.h>
#include <node_api.h>

static const void *kGlassKey = &kGlassKey;

@interface NLSidebarGlass : NSObject
@property(strong) NSSplitViewController *controller;
@property(strong) NSSplitViewItem *sidebar;
@end

@implementation NLSidebarGlass
@end

// The split view's divider would stand at the sidebar's edge, where the page
// is still clear over it; the page draws its own edge there.
@interface NLSplitView : NSSplitView
@end

@implementation NLSplitView
- (CGFloat)dividerThickness {
  return 0;
}
- (void)drawDividerInRect:(NSRect)rect {
}
@end

// Before macOS 27 AppKit's sidebar is not glass that can stand under a page.
static bool Supported(void) {
  return NSProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 27;
}

// The handle is BrowserWindow.getNativeWindowHandle(): a pointer to the
// window's content view.
static NSView *ContentView(napi_env env, napi_value value) {
  bool isBuffer = false;
  if (napi_is_buffer(env, value, &isBuffer) != napi_ok || !isBuffer) return nil;
  void *data = NULL;
  size_t length = 0;
  if (napi_get_buffer_info(env, value, &data, &length) != napi_ok) return nil;
  if (length < sizeof(void *)) return nil;
  return (__bridge NSView *)(*(void **)data);
}

static NSViewController *EmptyController(void) {
  NSViewController *controller = [[NSViewController alloc] init];
  controller.view = [[NSView alloc] initWithFrame:NSZeroRect];
  return controller;
}

static NLSidebarGlass *GlassFor(NSView *content) {
  NLSidebarGlass *glass = objc_getAssociatedObject(content, kGlassKey);
  if (glass) return glass;

  NSSplitViewController *controller = [[NSSplitViewController alloc] init];
  NLSplitView *splitView = [[NLSplitView alloc] initWithFrame:content.bounds];
  splitView.vertical = YES;
  controller.splitView = splitView;
  NSSplitViewItem *sidebar = [NSSplitViewItem sidebarWithViewController:EmptyController()];
  sidebar.canCollapse = NO;
  sidebar.allowsFullHeightLayout = YES;
  [controller addSplitViewItem:sidebar];
  [controller addSplitViewItem:[NSSplitViewItem splitViewItemWithViewController:EmptyController()]];

  NSView *view = controller.view;
  view.frame = content.bounds;
  view.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  [content addSubview:view positioned:NSWindowBelow relativeTo:nil];

  glass = [[NLSidebarGlass alloc] init];
  glass.controller = controller;
  glass.sidebar = sidebar;
  objc_setAssociatedObject(content, kGlassKey, glass, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  return glass;
}

// Pins the sidebar to one width: AppKit keeps its thickness between these two.
static void SetWidth(NLSidebarGlass *glass, CGFloat width) {
  NSSplitViewItem *sidebar = glass.sidebar;
  if (width > sidebar.maximumThickness) {
    sidebar.maximumThickness = width;
    sidebar.minimumThickness = width;
  } else {
    sidebar.minimumThickness = width;
    sidebar.maximumThickness = width;
  }
  [glass.controller.splitView setPosition:width ofDividerAtIndex:0];
}

static napi_value JsBoolean(napi_env env, bool value) {
  napi_value result;
  napi_get_boolean(env, value, &result);
  return result;
}

static napi_value IsSupported(napi_env env, napi_callback_info info) {
  return JsBoolean(env, Supported());
}

// show(handle, width): lays the glass, or moves it to the new width. A width
// under a point hides it. Answers whether glass is now under the sidebar.
static napi_value Show(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 2) {
    return JsBoolean(env, false);
  }
  double width = 0;
  if (napi_get_value_double(env, argv[1], &width) != napi_ok) return JsBoolean(env, false);
  NSView *content = ContentView(env, argv[0]);
  if (!content || !Supported() || ![NSThread isMainThread]) return JsBoolean(env, false);

  NLSidebarGlass *glass = GlassFor(content);
  NSView *view = glass.controller.view;
  if (width < 1) {
    view.hidden = YES;
    return JsBoolean(env, false);
  }
  view.hidden = NO;
  SetWidth(glass, width);
  return JsBoolean(env, true);
}

NAPI_MODULE_INIT() {
  napi_property_descriptor properties[] = {
      {"isSupported", NULL, IsSupported, NULL, NULL, NULL, napi_enumerable, NULL},
      {"show", NULL, Show, NULL, NULL, NULL, napi_enumerable, NULL},
  };
  napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);
  return exports;
}
