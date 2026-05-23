## 2025-05-20 - Centralized Timing-Safe Admin Authentication
**Vulnerability:** Scattered admin authentication logic was inconsistent, supported insecure query parameters, and lacked timing attack protection. Most critically, some endpoints would 'fail open' if `ADMIN_SECRET` was missing from the environment.
**Learning:** Security-critical logic like authentication should always be centralized to ensure consistency and a 'fail-closed' posture. Timing attacks are a subtle but real risk for secret comparisons.
**Prevention:** Use a shared middleware for all admin routes. Always verify that security-critical environment variables are present and fail-closed if they are not. Use `crypto.timingSafeEqual` for secret comparisons.
