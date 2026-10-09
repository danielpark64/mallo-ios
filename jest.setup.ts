// 모든 테스트 공통 설정
// SafeAreaView/useSafeAreaInsets는 네이티브 모듈이라 jest에서 공식 목을 사용
// (mock.tsx는 default export 하나에 컴포넌트들을 담고 있어 .default를 풀어줘야 named import가 동작)
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default
);
