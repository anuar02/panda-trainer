import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const installedSource = (path: string) =>
  readFileSync(resolve(__dirname, '../node_modules', path), 'utf8');

test('installed marker resolves a direct native scroll view and registers its seeking ancestor', () => {
  const marker = installedSource(
    'react-native-screens/ios/gamma/scroll-view-marker/RNSScrollViewMarkerComponentView.mm',
  );
  expect(marker).toContain('self.subviews.count <= 1');
  expect(marker).toContain(
    '[self resolveScrollViewFromChildView:self.subviews.firstObject]',
  );
  expect(marker).toContain('[childView isKindOfClass:UIScrollView.class]');
  expect(marker).toContain(
    '[childView isKindOfClass:RCTScrollViewComponentView.class]',
  );
  expect(marker).toContain(
    'static_cast<RCTScrollViewComponentView *>(childView).scrollView',
  );
  expect(marker).toContain(
    '[seekingAncestor registerDescendantScrollView:scrollView fromMarker:self]',
  );
  expect(marker).toContain('superview = [superview reactSuperview]');
});

test('installed tabs register UIKit scroll content and prefer the registered cache over first-child discovery', () => {
  const tabs = installedSource(
    'react-native-screens/ios/tabs/screen/RNSTabsScreenComponentView.mm',
  );
  expect(tabs).toContain(
    '[_controller setContentScrollView:scrollView forEdge:NSDirectionalRectEdgeAll]',
  );
  expect(tabs).toContain('_contentScrollView = scrollView');
  const support = installedSource(
    'react-native-screens/ios/helpers/container/RNSContainerItemSupport.mm',
  );
  expect(support.indexOf('return cachedScrollView')).toBeLessThan(
    support.indexOf('findScrollViewInFirstDescendantChainFrom:rootView'),
  );
  const finder = installedSource(
    'react-native-screens/ios/helpers/scroll-view/RNSScrollViewFinder.mm',
  );
  expect(finder).toContain('subviews[0]');
});

test('installed Expo Router plugin enables the gamma native implementation', () => {
  const plugin = installedSource('expo-router/plugin/build/withRouter.js');
  expect(plugin).toContain("ENV['RNS_GAMMA_ENABLED'] ||= '1'");
  const podspec = installedSource('react-native-screens/RNScreens.podspec');
  expect(podspec).toContain("ENV['RNS_GAMMA_ENABLED'] == '1'");
  expect(podspec).toContain('-DRNS_GAMMA_ENABLED=1');
});
