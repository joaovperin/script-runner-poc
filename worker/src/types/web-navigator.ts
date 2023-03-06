export interface WaitForOptions {
  timeout?: number;
}

export interface ClickOptions extends WaitForOptions {
  clickType?: "humanized" | "scripted" | "builtin";
  resetMousePosition?: boolean;
}

export interface DelayOptions {
  precision?: number;
}

export interface WebNavigator {
  navigate(url: string): Promise<void>;
  click(selector: string, options?: ClickOptions): Promise<void>;
  select(selector: string, value: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  clearText(selector: string): Promise<void>;
  waitFor(selector: string, options?: WaitForOptions): Promise<void>;
  evaluate(fn: Function, ...args: any[]): Promise<any>;
  delay(ms: number, random?: number, options?: DelayOptions): Promise<void>;
  hasSelector(selector: string): Promise<boolean>;
  onDialog(fn: (dialog: { accept: Function }) => Promise<void>): Promise<void>;

  // close(): Promise<void>;
  // solveCaptcha(correlationId?: string): Promise<void>;
  // getCurrentUrl(): Promise<string>;
  // openBrowser(url: string): Promise<void>;
  // getCookies(): Promise<any>;
  // createTemporaryNavigator(actionFocus?: boolean): Promise<WebNavigator>;
  // screenshot(title: string, reason: string): Promise<any>;
}