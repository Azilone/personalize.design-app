import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Eye,
  Image as ImageIcon,
  Plus,
  Type,
  X,
} from "lucide-react";
import { useStepperStore } from "../stepper-store";
import { useMediaQuery } from "../hooks/use-media-query";
import { validateFile } from "../lib/validation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./ui/sheet";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "./ui/carousel";
import { AnimatedCircularProgressBar } from "./ui/animated-circular-progress-bar";
import { ScratchToReveal } from "./ui/scratch-to-reveal";
import { cn } from "../lib/utils";

type ModalState = "editing" | "generating" | "reveal" | "preview" | "review";

const PLACEHOLDER_IMAGE_URL =
  "https://placehold.co/600x400?text=Heretext+Hello+World";

export const Shell = () => {
  const {
    isOpen,
    close,
    file,
    graphicFile,
    textInput,
    setFile,
    setGraphicFile,
    setTextInput,
    config,
  } = useStepperStore();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [graphicPreviewUrl, setGraphicPreviewUrl] = useState<string | null>(
    null,
  );
  const [modalState, setModalState] = useState<ModalState>("editing");
  const [progress, setProgress] = useState(0);
  const [selectedMockupIndex, setSelectedMockupIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const graphicInputRef = useRef<HTMLInputElement>(null);
  const logoUrlRef = useRef<string | null>(null);
  const graphicUrlRef = useRef<string | null>(null);
  const maxNameLength = 15;

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setLogoPreviewUrl(url);
      if (logoUrlRef.current) {
        URL.revokeObjectURL(logoUrlRef.current);
      }
      logoUrlRef.current = url;

      return () => {
        URL.revokeObjectURL(url);
        logoUrlRef.current = null;
      };
    }
    setLogoPreviewUrl(null);
    if (logoUrlRef.current) {
      URL.revokeObjectURL(logoUrlRef.current);
      logoUrlRef.current = null;
    }
  }, [file]);

  useEffect(() => {
    if (graphicFile) {
      const url = URL.createObjectURL(graphicFile);
      setGraphicPreviewUrl(url);
      if (graphicUrlRef.current) {
        URL.revokeObjectURL(graphicUrlRef.current);
      }
      graphicUrlRef.current = url;

      return () => {
        URL.revokeObjectURL(url);
        graphicUrlRef.current = null;
      };
    }
    setGraphicPreviewUrl(null);
    if (graphicUrlRef.current) {
      URL.revokeObjectURL(graphicUrlRef.current);
      graphicUrlRef.current = null;
    }
  }, [graphicFile]);

  useEffect(() => {
    if (!isOpen) {
      setModalState("editing");
      setProgress(0);
      setSelectedMockupIndex(0);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (modalState !== "generating") return;
    setProgress(0);
    const intervalId = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          window.clearInterval(intervalId);
          setModalState("reveal");
          return 100;
        }
        return prev + 1;
      });
    }, 100);

    return () => window.clearInterval(intervalId);
  }, [modalState]);

  const title = config.variantTitle
    ? `Personalizing - ${config.variantTitle}`
    : config.productTitle
      ? `Personalizing - ${config.productTitle}`
      : "Personalizing";
  const productImageUrl = config.productImageUrl || PLACEHOLDER_IMAGE_URL;
  const scratchSize = isDesktop ? 400 : 280;

  const mockupImages = useMemo(
    () => [
      { id: 1, label: "Front View", url: productImageUrl },
      { id: 2, label: "Back View", url: productImageUrl },
      { id: 3, label: "Side View", url: productImageUrl },
      { id: 4, label: "Detail View", url: productImageUrl },
    ],
    [productImageUrl],
  );

  const personalizationItems = useMemo(
    () =>
      [
        {
          id: 1,
          type: "image",
          icon: ImageIcon,
          label: file?.name || "Your Logo",
          isVisible: Boolean(file),
        },
        {
          id: 2,
          type: "text",
          icon: Type,
          label: textInput || "Name",
          isVisible: textInput.length > 0,
        },
        {
          id: 3,
          type: "image",
          icon: ImageIcon,
          label: graphicFile?.name || "Logo",
          isVisible: Boolean(graphicFile),
        },
      ].filter((item) => item.isVisible),
    [file, graphicFile, textInput],
  );

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    target: "logo" | "graphic",
  ) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    event.target.value = "";
    const errorMsg = await validateFile(selectedFile);
    if (errorMsg) {
      setError(errorMsg);
      return;
    }
    setError(null);
    if (target === "logo") {
      setFile(selectedFile);
    } else {
      setGraphicFile(selectedFile);
    }
  };

  const handleGenerate = () => {
    if (!file) {
      setError("Please upload an image to proceed.");
      return;
    }
    setError(null);
    setModalState("generating");
  };

  const handleScratchComplete = () => {
    setModalState("preview");
  };

  const handlePreview = () => {
    setModalState("review");
  };

  const handleBack = () => {
    if (modalState === "review") {
      setModalState("preview");
    } else if (modalState === "preview") {
      setModalState("editing");
      setProgress(0);
    }
  };

  const handleSaveDesign = () => {
    close();
  };

  const TitleComponent = isDesktop ? DialogTitle : SheetTitle;
  const DescriptionComponent = isDesktop ? DialogDescription : SheetDescription;

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="min-w-0">
          <TitleComponent className="text-2xl font-bold text-foreground">
            {title}
          </TitleComponent>
          <DescriptionComponent className="sr-only">
            Customize your product with AI
          </DescriptionComponent>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={close}
            className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Close personalization dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="flex w-full flex-1 flex-col border-b border-border lg:w-3/4 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-6 pt-4">
            <span className="text-base text-muted-foreground">
              {modalState === "review"
                ? mockupImages[selectedMockupIndex]?.label
                : "Front"}
            </span>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            {modalState === "generating" ? (
              <div className="flex flex-col items-center justify-center gap-4">
                <AnimatedCircularProgressBar
                  value={progress}
                  max={100}
                  min={0}
                  gaugePrimaryColor="#1a3a4a"
                  gaugeSecondaryColor="rgba(26, 58, 74, 0.2)"
                  className="size-48"
                  displayValue={`${progress}%`}
                />
                <p className="text-base text-muted-foreground">
                  Generating your design...
                </p>
              </div>
            ) : modalState === "reveal" ? (
              <div className="flex flex-col items-center justify-center gap-4">
                <p className="text-base text-muted-foreground">
                  Scratch to reveal your design!
                </p>
                <ScratchToReveal
                  width={scratchSize}
                  height={scratchSize}
                  minScratchPercentage={40}
                  onComplete={handleScratchComplete}
                  gradientColors={["#1a3a4a", "#2d5a6a", "#4a7a8a"]}
                  className="overflow-hidden rounded-lg"
                >
                  <div className="relative h-full w-full bg-muted">
                    <img
                      src={productImageUrl}
                      alt={config.productTitle ?? "Product"}
                      className="h-full w-full object-contain"
                    />
                  </div>
                </ScratchToReveal>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <div className="relative h-full w-full max-w-2xl">
                  <img
                    src={
                      modalState === "review"
                        ? mockupImages[selectedMockupIndex]?.url ||
                          PLACEHOLDER_IMAGE_URL
                        : productImageUrl
                    }
                    alt={config.productTitle ?? "Product"}
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>
            )}
          </div>
          {modalState === "review" && (
            <div className="px-6 pb-6">
              <Carousel
                opts={{ align: "start" }}
                className="mx-auto w-full max-w-xl"
              >
                <CarouselContent className="-ml-2">
                  {mockupImages.map((mockup, index) => (
                    <CarouselItem key={mockup.id} className="basis-1/4 pl-2">
                      <button
                        type="button"
                        onClick={() => setSelectedMockupIndex(index)}
                        className={cn(
                          "relative aspect-square w-full overflow-hidden rounded-lg border-2 transition-all",
                          selectedMockupIndex === index
                            ? "border-primary ring-2 ring-primary/20"
                            : "border-border hover:border-primary/50",
                        )}
                      >
                        <img
                          src={mockup.url || PLACEHOLDER_IMAGE_URL}
                          alt={mockup.label}
                          className="h-full w-full object-contain p-1"
                        />
                      </button>
                      <p className="mt-1 truncate text-center text-sm text-muted-foreground">
                        {mockup.label}
                      </p>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious className="left-0" />
                <CarouselNext className="right-0" />
              </Carousel>
            </div>
          )}
        </div>
        <div className="flex h-full w-full flex-col lg:w-1/4">
          {modalState === "editing" && (
            <>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="mb-6">
                  <h3 className="mb-4 text-lg font-semibold text-foreground">
                    Images
                  </h3>
                  <div className="mb-4">
                    <Label className="text-base font-medium text-foreground">
                      Your Logo
                    </Label>
                    <p className="mb-2 text-sm text-muted-foreground">
                      Add your company name
                    </p>
                    <div className="flex items-center gap-3">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(event) => handleImageUpload(event, "logo")}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="flex h-16 w-16 flex-col items-center justify-center rounded-lg border-2 border-dashed border-border transition-colors hover:border-primary/50 hover:bg-muted/50"
                      >
                        <Plus className="size-4 text-muted-foreground" />
                        <span className="mt-1 text-sm text-muted-foreground">
                          Image
                        </span>
                      </button>
                      {logoPreviewUrl && (
                        <div className="relative">
                          <div className="h-16 w-16 overflow-hidden rounded-lg border-2 border-primary/50 bg-muted">
                            <img
                              src={logoPreviewUrl}
                              alt="Logo preview"
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setFile(null)}
                            className="absolute -right-2 -top-2 rounded-full bg-primary p-0.5 text-primary-foreground transition-colors hover:bg-primary/80"
                            aria-label="Remove logo"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mb-4">
                    <Label className="text-base font-medium text-foreground">
                      Logo
                    </Label>
                    <p className="mb-2 text-sm text-muted-foreground">
                      Add your custom graphic
                    </p>
                    <div className="flex items-center gap-3">
                      <input
                        ref={graphicInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(event) =>
                          handleImageUpload(event, "graphic")
                        }
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => graphicInputRef.current?.click()}
                        className="flex h-16 w-16 flex-col items-center justify-center rounded-lg border-2 border-dashed border-border transition-colors hover:border-primary/50 hover:bg-muted/50"
                      >
                        <Plus className="size-4 text-muted-foreground" />
                        <span className="mt-1 text-sm text-muted-foreground">
                          Image
                        </span>
                      </button>
                      {graphicPreviewUrl && (
                        <div className="relative">
                          <div className="h-16 w-16 overflow-hidden rounded-lg border-2 border-primary/50 bg-muted">
                            <img
                              src={graphicPreviewUrl}
                              alt="Custom graphic preview"
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setGraphicFile(null)}
                            className="absolute -right-2 -top-2 rounded-full bg-primary p-0.5 text-primary-foreground transition-colors hover:bg-primary/80"
                            aria-label="Remove custom graphic"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="mb-4 text-lg font-semibold text-foreground">
                    Text
                  </h3>
                  <div>
                    <Label
                      htmlFor="animal-name"
                      className="text-base font-medium text-foreground"
                    >
                      Name
                    </Label>
                    <p className="mb-2 text-sm text-muted-foreground">
                      Name of your animal
                    </p>
                    <div className="relative">
                      <Input
                        id="animal-name"
                        value={textInput}
                        onChange={(event) =>
                          setTextInput(
                            event.target.value.slice(0, maxNameLength),
                          )
                        }
                        placeholder="Enter name"
                        className="pr-12"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        {textInput.length}/{maxNameLength}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 border-t border-border p-6">
                {error && (
                  <p className="text-xs font-medium text-destructive">
                    {error}
                  </p>
                )}
                <Button
                  onClick={handleGenerate}
                  className="w-full bg-[#1a3a4a] text-white hover:bg-[#1a3a4a]/90"
                  size="lg"
                >
                  Generate
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  By continuing you agree to the{" "}
                  <a
                    href="/policies/terms-of-service"
                    className="underline transition-colors hover:text-foreground"
                  >
                    terms of service
                  </a>
                </p>
              </div>
            </>
          )}

          {modalState === "generating" && (
            <div className="flex flex-1 flex-col items-center justify-center p-6">
              <p className="mb-2 text-base font-semibold text-foreground">
                Creating your design
              </p>
              <p className="text-center text-base text-muted-foreground">
                Please wait while we generate your personalized product...
              </p>
            </div>
          )}

          {modalState === "reveal" && (
            <div className="flex flex-1 flex-col items-center justify-center p-6">
              <p className="mb-2 text-base font-semibold text-foreground">
                Your design is ready!
              </p>
              <p className="text-center text-base text-muted-foreground">
                Scratch the image to reveal your personalized design.
              </p>
            </div>
          )}

          {modalState === "preview" && (
            <>
              <div className="flex flex-1 flex-col items-center justify-center p-6">
                <p className="mb-2 text-base font-semibold text-foreground">
                  Design Generated!
                </p>
                <p className="text-center text-base text-muted-foreground">
                  Click Preview to see your design on different mockups.
                </p>
              </div>
              <div className="space-y-3 border-t border-border p-6">
                <Button
                  onClick={handlePreview}
                  variant="outline"
                  className="w-full bg-transparent"
                  size="lg"
                >
                  <Eye className="mr-2 size-4" />
                  Preview
                </Button>
                <Button
                  onClick={handleSaveDesign}
                  className="w-full bg-[#1a3a4a] text-white hover:bg-[#1a3a4a]/90"
                  size="lg"
                >
                  Save design
                </Button>
              </div>
            </>
          )}

          {modalState === "review" && (
            <>
              <div className="flex-1 overflow-y-auto p-6">
                <h3 className="mb-2 text-2xl font-bold text-foreground">
                  Review your design
                </h3>
                <p className="mb-6 text-base text-muted-foreground">
                  Personalization
                </p>
                <div className="space-y-2">
                  {personalizationItems.length > 0 ? (
                    personalizationItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <item.icon className="size-5 text-muted-foreground" />
                          <span className="text-base text-foreground">
                            {item.label}
                          </span>
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </button>
                    ))
                  ) : (
                    <p className="py-4 text-center text-base text-muted-foreground">
                      No personalizations added yet.
                    </p>
                  )}
                </div>
              </div>
              <div className="border-t border-border p-6">
                <div className="flex gap-3">
                  <Button
                    onClick={handleBack}
                    variant="outline"
                    className="flex-1 bg-transparent"
                    size="lg"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleSaveDesign}
                    className="flex-1 bg-[#1a3a4a] text-white hover:bg-[#1a3a4a]/90"
                    size="lg"
                  >
                    Save design
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
        <DialogContent
          showCloseButton={false}
          className="pd-stepper-theme fixed z-50 flex h-[90vh] w-[95vw] max-w-none flex-col overflow-hidden rounded-lg bg-white p-0 shadow-xl"
        >
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="pd-stepper-theme fixed z-50 flex h-[100dvh] w-full flex-col border-none bg-white p-0 shadow-xl"
      >
        {content}
      </SheetContent>
    </Sheet>
  );
};
