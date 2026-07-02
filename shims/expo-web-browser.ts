// Safe shim for expo-web-browser
// Wraps the real module but guards maybeCompleteAuthSession for compatibility
let _WebBrowser: any = {};

try {
  _WebBrowser = require('expo-web-browser');
} catch (_) {}

const WebBrowser = {
  ..._WebBrowser,
  maybeCompleteAuthSession: (options?: any) => {
    if (typeof _WebBrowser?.maybeCompleteAuthSession === 'function') {
      return _WebBrowser.maybeCompleteAuthSession(options);
    }
    return { type: 'success' };
  },
  openAuthSessionAsync: async (url: string, redirectUrl?: string, options?: any) => {
    if (typeof _WebBrowser?.openAuthSessionAsync === 'function') {
      return _WebBrowser.openAuthSessionAsync(url, redirectUrl, options);
    }
    return { type: 'cancel' };
  },
  openBrowserAsync: async (url: string, options?: any) => {
    if (typeof _WebBrowser?.openBrowserAsync === 'function') {
      return _WebBrowser.openBrowserAsync(url, options);
    }
    return { type: 'cancel' };
  },
  dismissBrowser: () => {
    if (typeof _WebBrowser?.dismissBrowser === 'function') {
      return _WebBrowser.dismissBrowser();
    }
  },
  dismissAuthSession: () => {
    if (typeof _WebBrowser?.dismissAuthSession === 'function') {
      return _WebBrowser.dismissAuthSession();
    }
  },
};

export default WebBrowser;
export const maybeCompleteAuthSession = WebBrowser.maybeCompleteAuthSession;
export const openAuthSessionAsync = WebBrowser.openAuthSessionAsync;
export const openBrowserAsync = WebBrowser.openBrowserAsync;
export const dismissBrowser = WebBrowser.dismissBrowser;
export const dismissAuthSession = WebBrowser.dismissAuthSession;
