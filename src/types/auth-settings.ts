/**
 * Storefront login settings (Settings → Login & OTP). The Firebase values are
 * the public web-app config from the Firebase console — safe to send to the
 * browser; they only identify the project.
 */
export interface FirebaseWebConfig { apiKey: string; authDomain: string; projectId: string; appId: string; messagingSenderId: string }

export interface AuthSettings {
  /** Mobile number + OTP login / sign-up (needs the Firebase config below). */
  otpEnabled: boolean;
  /** Customers can also log in with mobile/email + password (once they've set one). */
  passwordLogin: boolean;
  countryCode: string; // "+91"
  firebase: FirebaseWebConfig;
}

export const DEFAULT_AUTH: AuthSettings = {
  otpEnabled: false,
  passwordLogin: true,
  countryCode: "+91",
  firebase: { apiKey: "", authDomain: "", projectId: "", appId: "", messagingSenderId: "" },
};

/** OTP can actually run: switched on and the required Firebase fields are filled. */
export const otpReady = (a: AuthSettings) => a.otpEnabled && !!(a.firebase.apiKey && a.firebase.authDomain && a.firebase.projectId && a.firebase.appId);
