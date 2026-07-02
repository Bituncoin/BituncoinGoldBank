// @ts-nocheck
export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface AlertState {
  visible: boolean;
  title: string;
  message: string;
  buttons: AlertButton[];
}