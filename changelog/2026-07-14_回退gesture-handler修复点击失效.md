# 回退 gesture-handler 修复点击切换失效

## 改动原因

上一次提交引入 `GestureHandlerRootView` + gesture-handler 版本 `ScrollView` 解决 iOS 难度卡片滑动问题后，全局 gesture-handler 手势系统干扰了原生 `Pressable` 的 tap 事件，导致版本切换和 DX/SD 谱面切换全部失效。

## 具体实现

1. **`app/_layout.tsx`**：移除 `GestureHandlerRootView` 包裹，恢复原始 `QueryClientProvider` 作为根容器。
2. **`app/songs/[songId].tsx`**：
   - 移除 `react-native-gesture-handler` 导入和 `ComponentRef` 类型导入
   - `ChartCarousel` 内层横向 ScrollView 从 `GestureScrollView` 改回普通 RN `ScrollView`
   - 新增 `nestedScrollEnabled` prop，显式启用嵌套滚动（iOS 原生支持，Android 需要）
   - 保留 `directionalLockEnabled` 在外层垂直 ScrollView（iOS 首次滑动方向锁定）
   - 保留 `contentOffset` prop + `useEffect` 中 `scrollTo` 双保险初始定位
3. **`tests/m2-query.test.tsx`**：移除 `react-native-gesture-handler` mock。

## 期望输出

版本切换按钮和 DX/SD 谱面切换按钮恢复正常点击响应。iOS 嵌套滑动由 `directionalLockEnabled` + `nestedScrollEnabled` 原生处理。

## 实际输出

`npm run typecheck` 通过。Jest 全部 6 套件 23 测试通过。待 iOS 真机验证点击恢复与滑动是否仍可用。
