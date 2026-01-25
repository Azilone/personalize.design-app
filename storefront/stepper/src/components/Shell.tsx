import { useEffect, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { useStepperStore } from "../stepper-store";
import { useMediaQuery } from "../hooks/use-media-query";
import { InputStep } from "./InputStep";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "./ui/sheet";

export const Shell = () => {
  const { isOpen, close, step, totalSteps, file, config } = useStepperStore();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [file]);

  const title = config.variantTitle
    ? `Personalizing - ${config.variantTitle}`
    : config.productTitle
      ? `Personalizing - ${config.productTitle}`
      : "Personalizing";
  const stepLabel = `Step ${step} of ${totalSteps}`;

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
        <span className="text-base font-semibold text-foreground">{title}</span>
        <span className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
          {stepLabel}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-[240px] flex-1 flex-col gap-4 bg-muted/20 p-6">
          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Front
          </span>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-white p-6 shadow-sm">
            {config.productImageUrl ? (
              <img
                src={config.productImageUrl}
                alt={config.productTitle ?? "Product"}
                className="max-h-full w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <ImageIcon className="h-7 w-7" />
                </div>
                <span className="text-sm font-medium">Preview</span>
              </div>
            )}
          </div>
          {previewUrl && (
            <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
              <div className="h-12 w-12 overflow-hidden rounded-md border bg-muted">
                <img
                  src={previewUrl}
                  alt="Uploaded preview"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="text-sm">
                <p className="font-medium text-foreground">Your upload</p>
                <p className="text-xs text-muted-foreground">Ready to apply</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex w-full min-h-0 flex-col border-t lg:w-[360px] lg:border-l lg:border-t-0">
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {step === 1 ? (
              <InputStep previewUrl={previewUrl} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <p>Step {step} placeholder</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
        <DialogContent className="pd-stepper-theme fixed z-50 flex h-[85vh] max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white p-0 shadow-xl sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="sr-only">Personalize Product</DialogTitle>
            <DialogDescription className="sr-only">
              Customize your product with AI
            </DialogDescription>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="bottom"
        className="pd-stepper-theme fixed z-50 flex h-[100dvh] w-full flex-col border-none bg-white p-0 shadow-xl"
      >
        <SheetHeader>
          <SheetTitle className="sr-only">Personalize Product</SheetTitle>
          <SheetDescription className="sr-only">
            Customize your product with AI
          </SheetDescription>
        </SheetHeader>
        {content}
      </SheetContent>
    </Sheet>
  );
};
