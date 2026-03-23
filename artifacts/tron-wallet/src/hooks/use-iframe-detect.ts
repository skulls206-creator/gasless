import { useEffect, useState } from "react";

export function useIframeDetect() {
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      // Cross-origin parent — being blocked means we're definitely in an iframe
      setIsInIframe(true);
    }
  }, []);

  return isInIframe;
}
