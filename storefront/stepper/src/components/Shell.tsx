import { useStepperStore } from "../stepper-store";
import { useMediaQuery } from "../hooks/use-media-query";
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
  const { isOpen, close, step, totalSteps } = useStepperStore();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const content = (
    <div className="flex flex-col gap-4 pt-6">
      <div className="flex items-center justify-between text-sm uppercase tracking-[0.2em] text-muted-foreground">
        <span>Personalize</span>
        <span>
          Step {step} of {totalSteps}
        </span>
      </div>
      <h2 className="mt-4 text-3xl font-semibold text-foreground">
        Design your personalized product!
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This is the storefront stepper shell. UI steps will replace this
        placeholder as the flow lands.
      </p>
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-[600px]">
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
        className="h-[100dvh] w-full rounded-none border-none p-4"
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
