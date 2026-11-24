/** Staff session cookie names (`__Host-` in production; plain names only for plain-http dev). */
export const STAFF_SESSION_COOKIES = ['__Host-khums_staff', 'khums_staff'] as const;

/** Staff CSRF cookie names (readable by the page; sent back as `X-CSRF-Token`). */
export const STAFF_CSRF_COOKIES = ['__Host-khums_csrf', 'khums_csrf'] as const;
