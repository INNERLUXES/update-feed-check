// The built-in configuration: the level of every rule, the platforms a release must cover, the lowest level shown
// and the level that fails the run. docs/inputs.md describes every key, and --print-defaults writes the
// configuration out.

// The level of every rule that the configuration can set. The two rules of input problems are always errors.
export const DEFAULT_RULES = {
  missingHash: 'error',
  missingSignature: 'error',
  missingUrl: 'error',
  insecureUrl: 'error',
  mixedHosts: 'warning',
  invalidVersion: 'error',
  itemOrder: 'error',
  duplicateVersion: 'error',
  versionNotIncreased: 'error',
  distFileMissing: 'error',
  sizeMismatch: 'error',
  hashMismatch: 'error',
  missingPlatform: 'warning',
  invalidRollout: 'error',
  mixedVersions: 'warning',
  missingReleaseNotes: 'info'
};

// The platforms a release must cover. tauri lists the OS-ARCH keys every Tauri feed must have; electron lists the
// electron-updater feed files a folder of feeds must hold when it holds one of them. A configuration replaces a list
// as a whole, and an empty list turns that check off.
export const DEFAULT_REQUIRED_PLATFORMS = {
  tauri: ['windows-x86_64', 'darwin-aarch64', 'darwin-x86_64', 'linux-x86_64'],
  electron: ['latest.yml', 'latest-mac.yml', 'latest-linux.yml']
};

// The lowest level of a finding that is shown.
export const DEFAULT_MIN_SEVERITY = 'info';

// The lowest level of a finding that fails the run.
export const DEFAULT_FAIL_ON = 'error';
