import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import { X, Camera, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QRScannerProps {
  onScan: (value: string) => void;
  onClose: () => void;
}

export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const reader = new BrowserQRCodeReader();
    let cancelled = false;

    (async () => {
      try {
        const devices = await BrowserQRCodeReader.listVideoInputDevices();
        // Prefer rear camera
        const device =
          devices.find((d) => /back|rear|environment/i.test(d.label)) ?? devices[0];

        if (!device) {
          setError("No camera found on this device.");
          return;
        }

        if (!videoRef.current || cancelled) return;

        controlsRef.current = await reader.decodeFromVideoDevice(
          device.deviceId,
          videoRef.current,
          (result, err) => {
            if (result && !cancelled) {
              const text = result.getText();
              // Support plain address or tron: URI scheme
              const address = text.startsWith("tron:")
                ? text.replace(/^tron:/, "").split("?")[0]
                : text.trim();
              onScan(address);
            }
            if (err && !(err instanceof Error && err.message.includes("No MultiFormat"))) {
              // Ignore "no QR found in frame" errors — they're normal
            }
          },
        );

        if (!cancelled) setReady(true);
      } catch (e: any) {
        if (!cancelled) {
          if (e?.name === "NotAllowedError") {
            setError("Camera permission denied. Please allow camera access and try again.");
          } else if (e?.name === "NotFoundError") {
            setError("No camera found on this device.");
          } else {
            setError(e?.message ?? "Could not start camera.");
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 pt-safe">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-white">Scan QR Code</h2>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Camera viewport */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />

        {/* Scan frame overlay */}
        {!error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-64 h-64">
              {/* Dimmed surround */}
              <div className="absolute inset-[-9999px] bg-black/50" />
              {/* Clear center */}
              <div className="absolute inset-0 bg-transparent" />
              {/* Corner markers */}
              {["top-0 left-0", "top-0 right-0", "bottom-0 left-0", "bottom-0 right-0"].map((pos, i) => (
                <span
                  key={i}
                  className={`absolute w-8 h-8 border-primary ${pos} ${
                    i === 0 ? "border-t-2 border-l-2 rounded-tl-md" :
                    i === 1 ? "border-t-2 border-r-2 rounded-tr-md" :
                    i === 2 ? "border-b-2 border-l-2 rounded-bl-md" :
                              "border-b-2 border-r-2 rounded-br-md"
                  }`}
                />
              ))}
              {/* Animated scan line */}
              {ready && (
                <div className="animate-scan h-0.5 bg-primary/80 shadow-[0_0_8px_2px_rgba(168,85,247,0.6)]" />
              )}
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <AlertCircle className="w-12 h-12 text-destructive" />
            <p className="text-white text-sm">{error}</p>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        )}

        {/* Loading state */}
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="p-4 pb-safe text-center">
        <p className="text-sm text-white/50">Point camera at a TRON wallet QR code</p>
      </div>
    </div>
  );
}
