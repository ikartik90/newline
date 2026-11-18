// AppKit's own sidebar glass, laid under the page's sidebar.
//
// macOS draws Finder's sidebar as the sidebar item of an NSSplitViewController.
// This lays one such split view at the bottom of an Electron window, below the
// page, with its sidebar exactly as wide as the page's: where the page is clear
// over its sidebar, AppKit's sidebar shows through, drawn by AppKit itself. The
// split view's middle lies under the note pane, which the page paints solid,
// and its inspector, the trailing pane AppKit glazes as it does the sidebar,
// under the page's Gemma rail while that is open.
//
// It also lays glass under the command palette's own window: AppKit's Liquid
// Glass, filled with the popover material at an opacity of the caller's, from
// bare glass at 0 to as solid as a popover at 1. Its window, borderless and
// shaped by the glass's corner alone, keeps a titled window's shadow but loses the rims macOS draws with one. That
// window never becomes the main window, so the note window under it keeps its
// lit buttons and its sidebar glass while the palette takes the keys, as under
// a Font panel.
//
// Built by scripts/build-native.mjs; loaded by src/main/sidebar-glass.ts.

#import <AppKit/AppKit.h>
#import <objc/message.h>
#import <objc/runtime.h>
#include <node_api.h>

static const void *kGlassKey = &kGlassKey;
static const void *kPanelGlassKey = &kPanelGlassKey;
static const void *kNeverMainKey = &kNeverMainKey;
static const void *kRimlessKey = &kRimlessKey;
static const void *kCornerMaskKey = &kCornerMaskKey;

@interface NLSidebarGlass : NSObject
@property(strong) NSSplitViewController *controller;
@property(strong) NSSplitViewItem *sidebar;
@property(strong) NSSplitViewItem *inspector;
// The glass over the whole window while the command palette shows, and
// whether it is up: the sidebar's own is hidden under it meanwhile.
@property(strong) NSView *window;
@property BOOL whole;
// Whether the page has a sidebar, and a Gemma rail, for it to stand under.
@property BOOL shown;
@property BOOL railShown;
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
  NSSplitViewItem *inspector = [NSSplitViewItem inspectorWithViewController:EmptyController()];
  inspector.canCollapse = YES;
  inspector.collapsed = YES;
  inspector.allowsFullHeightLayout = YES;
  [controller addSplitViewItem:inspector];

  NSView *view = controller.view;
  view.frame = content.bounds;
  view.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  [content addSubview:view positioned:NSWindowBelow relativeTo:nil];

  glass = [[NLSidebarGlass alloc] init];
  glass.controller = controller;
  glass.sidebar = sidebar;
  glass.inspector = inspector;
  objc_setAssociatedObject(content, kGlassKey, glass, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  return glass;
}

// Pins an item to one width: AppKit keeps its thickness between these two.
static void PinThickness(NSSplitViewItem *item, CGFloat width) {
  if (width > item.maximumThickness) {
    item.maximumThickness = width;
    item.minimumThickness = width;
  } else {
    item.minimumThickness = width;
    item.maximumThickness = width;
  }
}

static void SetWidth(NLSidebarGlass *glass, CGFloat width) {
  PinThickness(glass.sidebar, width);
  [glass.controller.splitView setPosition:width ofDividerAtIndex:0];
}

static void SetRailWidth(NLSidebarGlass *glass, CGFloat width) {
  NSSplitViewItem *inspector = glass.inspector;
  if (width < 1) {
    inspector.collapsed = YES;
    return;
  }
  PinThickness(inspector, width);
  inspector.collapsed = NO;
  NSSplitView *splitView = glass.controller.splitView;
  [splitView setPosition:NSWidth(splitView.bounds) - width ofDividerAtIndex:1];
}

// The split view shows while the page has a sidebar or a rail over it, and
// hides under the window's glass, to show as it is once that goes. The
// sidebar's item keeps its last width under a collapsed sidebar, where the
// note pane's solid canvas covers it.
static void ShowSplitView(NLSidebarGlass *glass) {
  glass.controller.view.hidden = glass.whole || !(glass.shown || glass.railShown);
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
  glass.shown = width >= 1;
  if (glass.shown) SetWidth(glass, width);
  ShowSplitView(glass);
  return JsBoolean(env, glass.shown);
}

// showRail(handle, width): lays the inspector's glass at the window's right
// edge under the Gemma rail, or moves it to the new width. A width under a
// point takes it away. Answers whether glass is now under the rail.
static napi_value ShowRail(napi_env env, napi_callback_info info) {
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
  glass.railShown = width >= 1;
  SetRailWidth(glass, width);
  ShowSplitView(glass);
  return JsBoolean(env, glass.railShown);
}

// The sidebar's glass is Liquid Glass in AppKit's private sidebar variant,
// which gives it the sidebar's tint. Liquid Glass bends what is behind it near
// its edges, the band wider the larger the glass, and where two edges' bends
// meet it creases from each corner. Over the whole window it stands past the
// window on every side, so the window shows only its even middle.
static const NSInteger kSidebarGlassVariant = 17;
static const CGFloat kWindowGlassBleed = 400;

static NSView *WindowGlassFor(NLSidebarGlass *glass, NSView *content) {
  if (glass.window) return glass.window;
  if (@available(macOS 26.0, *)) {
    NSRect bled = NSInsetRect(content.bounds, -kWindowGlassBleed, -kWindowGlassBleed);
    NSGlassEffectView *view = [[NSGlassEffectView alloc] initWithFrame:bled];
    if ([view respondsToSelector:NSSelectorFromString(@"set_variant:")]) {
      [view setValue:@(kSidebarGlassVariant) forKey:@"_variant"];
    }
    view.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    view.hidden = YES;
    // Over the sidebar's split view, under the page.
    [content addSubview:view positioned:NSWindowAbove relativeTo:glass.controller.view];
    glass.window = view;
  }
  return glass.window;
}

// windowGlass(handle, on): lays the sidebar's glass over the whole window, the
// sidebar's own hidden under it so the two never stack, while the page clears
// its note for the command palette; off, the sidebar's shows again. Answers
// whether the window is now all glass.
static napi_value WindowGlass(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 2) {
    return JsBoolean(env, false);
  }
  bool on = false;
  if (napi_get_value_bool(env, argv[1], &on) != napi_ok) return JsBoolean(env, false);
  NSView *content = ContentView(env, argv[0]);
  if (!content || !Supported() || ![NSThread isMainThread]) return JsBoolean(env, false);

  NLSidebarGlass *glass = GlassFor(content);
  NSView *whole = WindowGlassFor(glass, content);
  if (!whole) return JsBoolean(env, false);
  whole.hidden = !on;
  glass.whole = on;
  ShowSplitView(glass);
  return JsBoolean(env, on);
}

// Puts `imp` in place of `sel` on `cls` and answers what was there, so the
// override can hand every window it is not for back to it.
static IMP Override(Class cls, SEL sel, IMP imp) {
  Method inherited = class_getInstanceMethod(cls, sel);
  IMP was = method_getImplementation(inherited);
  if (was == imp) return NULL;
  if (class_addMethod(cls, sel, imp, method_getTypeEncoding(inherited))) return was;
  return method_setImplementation(inherited, imp);
}

// Electron's panel is an ElectronNSWindow, which answers canBecomeMainWindow
// yes. The override goes on the window's class, but only a window marked
// never-main answers no: every other keeps the answer it had.
static BOOL (*InheritedCanBecomeMain)(id, SEL) = NULL;

static BOOL CanBecomeMain(id self, SEL cmd) {
  if (objc_getAssociatedObject(self, kNeverMainKey)) return NO;
  return InheritedCanBecomeMain(self, cmd);
}

static void KeepFromMain(NSWindow *window) {
  objc_setAssociatedObject(window, kNeverMainKey, @YES, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  IMP was = Override(window.class, @selector(canBecomeMainWindow), (IMP)CanBecomeMain);
  if (was) InheritedCanBecomeMain = (BOOL (*)(id, SEL))was;
}

// A shadowed window is rimmed by macOS: a hard dark outline outside it and a
// faint white line inside. AppKit reads both from the window's shadow
// parameters, beside the shadow's own. The palette is borderless, so that
// macOS doesn't clip its corners past the glass's own; borderless, its
// shadow would be a panel's faint one, so it answers a titled panel's shadow
// (Electron's frameless default), rims at nothing.
static NSDictionary *RimlessTitledShadow(void) {
  static NSDictionary *shadow = nil;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    NSPanel *titled = [[NSPanel alloc]
        initWithContentRect:NSMakeRect(0, 0, 100, 100)
                  styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable |
                            NSWindowStyleMaskNonactivatingPanel
                    backing:NSBackingStoreBuffered
                      defer:YES];
    NSMutableDictionary *parameters = [((id (*)(id, SEL))objc_msgSend)(
        titled, NSSelectorFromString(@"shadowParameters")) mutableCopy];
    for (NSString *key in @[
           @"com.apple.WindowShadowRimDensityActive", @"com.apple.WindowShadowRimDensityInactive",
           @"com.apple.WindowShadowInnerRimDensityActive",
           @"com.apple.WindowShadowInnerRimDensityInactive"
         ]) {
      parameters[key] = @0;
    }
    shadow = [parameters copy];
  });
  return shadow;
}

static id (*InheritedShadowParameters)(id, SEL) = NULL;

static id ShadowParameters(id self, SEL cmd) {
  id parameters = InheritedShadowParameters(self, cmd);
  if (!objc_getAssociatedObject(self, kRimlessKey) ||
      ![parameters isKindOfClass:NSDictionary.class]) {
    return parameters;
  }
  return RimlessTitledShadow();
}

static void KeepShadowWithoutRims(NSWindow *window) {
  SEL read = NSSelectorFromString(@"shadowParameters");
  SEL apply = NSSelectorFromString(@"_setShadowParameters");
  if (![window respondsToSelector:read] || ![window respondsToSelector:apply]) return;
  objc_setAssociatedObject(window, kRimlessKey, @YES, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  IMP was = Override(window.class, read, (IMP)ShadowParameters);
  if (was) InheritedShadowParameters = (id (*)(id, SEL))was;
  ((void (*)(id, SEL))objc_msgSend)(window, apply);
  [window invalidateShadow];
}

// A rounded rect that stretches to any size, its corners kept.
static NSImage *RoundedMask(double radius) {
  NSImage *mask = [NSImage imageWithSize:NSMakeSize(2 * radius + 1, 2 * radius + 1)
                                 flipped:NO
                          drawingHandler:^BOOL(NSRect rect) {
                            [NSColor.blackColor setFill];
                            [[NSBezierPath bezierPathWithRoundedRect:rect xRadius:radius yRadius:radius] fill];
                            return YES;
                          }];
  mask.capInsets = NSEdgeInsetsMake(radius, radius, radius, radius);
  mask.resizingMode = NSImageResizingModeStretch;
  return mask;
}

// A borderless window is square, and so is its shadow, standing past the
// glass's corner. AppKit shapes a window, and its shadow, by its corner mask.
static id (*InheritedCornerMask)(id, SEL) = NULL;

static id CornerMask(id self, SEL cmd) {
  id mask = objc_getAssociatedObject(self, kCornerMaskKey);
  return mask ?: InheritedCornerMask(self, cmd);
}

static void KeepCorner(NSWindow *window, double radius) {
  SEL read = NSSelectorFromString(@"_cornerMask");
  if (![window respondsToSelector:read]) return;
  objc_setAssociatedObject(window, kCornerMaskKey, RoundedMask(radius),
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  IMP was = Override(window.class, read, (IMP)CornerMask);
  if (was) InheritedCornerMask = (id (*)(id, SEL))was;
  [window.contentView.superview setNeedsDisplay:YES];
  [window invalidateShadow];
}

// panelGlass(handle, radius, fill): fills a clear window with Liquid Glass,
// cornered at `radius`, under its page, its popover fill at opacity `fill`;
// again, it sets the fill.
// The glass draws its own rim, so the page draws no edge over it. The window
// never becomes main, is shaped and shadowed to the glass's corner without
// macOS's rims, and stays shown while another app is in front, as a dialog in
// the window under it would (a panel hides then, by default). Answers whether
// the glass is there.
static napi_value PanelGlass(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 3) {
    return JsBoolean(env, false);
  }
  double radius = 0;
  double opacity = 1;
  if (napi_get_value_double(env, argv[1], &radius) != napi_ok ||
      napi_get_value_double(env, argv[2], &opacity) != napi_ok) {
    return JsBoolean(env, false);
  }
  radius = MAX(0, radius);
  opacity = MAX(0, MIN(1, opacity));
  NSView *content = ContentView(env, argv[0]);
  if (!content || !Supported() || ![NSThread isMainThread]) return JsBoolean(env, false);

  if (@available(macOS 26.0, *)) {
    NSGlassEffectView *laid = objc_getAssociatedObject(content, kPanelGlassKey);
    if (laid) {
      laid.contentView.alphaValue = opacity;
      return JsBoolean(env, true);
    }

    NSGlassEffectView *glass = [[NSGlassEffectView alloc] initWithFrame:content.bounds];
    glass.cornerRadius = radius;
    glass.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    // Bare glass lets the note under it read through the rows; the popover's
    // material, blurring what is behind the window, is as solid as a popover.
    // Its opacity is the dial between the two.
    NSVisualEffectView *fill = [[NSVisualEffectView alloc] initWithFrame:content.bounds];
    fill.material = NSVisualEffectMaterialPopover;
    fill.blendingMode = NSVisualEffectBlendingModeBehindWindow;
    fill.state = NSVisualEffectStateActive;
    fill.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    fill.alphaValue = opacity;
    glass.contentView = fill;
    [content addSubview:glass positioned:NSWindowBelow relativeTo:nil];
    objc_setAssociatedObject(content, kPanelGlassKey, glass, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  } else {
    return JsBoolean(env, false);
  }
  if (content.window) {
    KeepFromMain(content.window);
    KeepShadowWithoutRims(content.window);
    KeepCorner(content.window, radius);
    content.window.hidesOnDeactivate = NO;
  }
  return JsBoolean(env, true);
}

// floatPanel(handle): keeps a panel from becoming the main window, so the
// window it floats over stays lit while it takes the keys, and keeps it up
// while another app has them, as a dialog stays.
static napi_value FloatPanel(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 1) {
    return JsBoolean(env, false);
  }
  NSView *content = ContentView(env, argv[0]);
  if (!content || !content.window || ![NSThread isMainThread]) return JsBoolean(env, false);
  KeepFromMain(content.window);
  content.window.hidesOnDeactivate = NO;
  return JsBoolean(env, true);
}

NAPI_MODULE_INIT() {
  napi_property_descriptor properties[] = {
      {"isSupported", NULL, IsSupported, NULL, NULL, NULL, napi_enumerable, NULL},
      {"show", NULL, Show, NULL, NULL, NULL, napi_enumerable, NULL},
      {"showRail", NULL, ShowRail, NULL, NULL, NULL, napi_enumerable, NULL},
      {"panelGlass", NULL, PanelGlass, NULL, NULL, NULL, napi_enumerable, NULL},
      {"floatPanel", NULL, FloatPanel, NULL, NULL, NULL, napi_enumerable, NULL},
      {"windowGlass", NULL, WindowGlass, NULL, NULL, NULL, napi_enumerable, NULL},
  };
  napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);
  return exports;
}
