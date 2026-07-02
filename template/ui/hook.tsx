// @ts-nocheck
import { useAlertContext } from './context';

/**
 * useAlert Hook - simplified Context consumer
 * 
 * Usage:
 * ```tsx
 * import { useAlert } from '@/sdk';
 * 
 * function MyComponent() {
 *   const { showAlert } = useAlert();
 *   
 *   const handleClick = () => {
 *     showAlert('Success', 'Operation completed successfully');
 *   };
 *   
 *   return <Button onPress={handleClick}>Click me</Button>;
 * }
 * ```
 * 
 * Features:
 * - Unified API: Same interface for all platforms
 * - Auto platform handling: Web uses modal, mobile uses native Alert
 * - Zero configuration: Just wrap root with AlertProvider
 * - Stable architecture: Based on React Context
 */
export function useAlert() {
  return useAlertContext();
}