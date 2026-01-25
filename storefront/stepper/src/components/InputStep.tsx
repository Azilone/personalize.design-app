import React, { useCallback, useId, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { useStepperStore } from "../stepper-store";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import { validateFile, ALLOWED_TYPES } from "../lib/validation";

type InputStepProps = {
  previewUrl: string | null;
};

export const InputStep = ({ previewUrl }: InputStepProps) => {
  const { file, textInput, setFile, setTextInput, next, config } =
    useStepperStore();
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const errorMsg = validateFile(file);
    if (errorMsg) {
      setError(errorMsg);
      return;
    }
    setError(null);
    setFile(file);
  };

  const onDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
    e.target.value = "";
  };

  const handleGenerate = () => {
    if (!file) {
      setError("Please upload an image to proceed.");
      return;
    }
    next();
  };

  return (
    <div className="flex h-full flex-col justify-between">
      <div className="space-y-8">
        {/* Images Section */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold leading-tight text-foreground">
              Images
            </h3>
            <p className="text-sm text-muted-foreground">
              Add your logo or artwork.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">
                Your Logo
              </Label>
              <p className="text-xs text-muted-foreground">
                Add your company name
              </p>

              <div className="flex flex-wrap items-center gap-3">
                {file ? (
                  <div className="relative h-24 w-24 overflow-hidden rounded-lg border bg-background shadow-sm">
                    {previewUrl && (
                      <img
                        src={previewUrl}
                        className="h-full w-full object-cover"
                        alt="Uploaded preview"
                      />
                    )}
                    <button
                      type="button"
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                        setError(null);
                      }}
                      aria-label="Remove image"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={cn(
                      "group flex h-24 w-24 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/5 transition-all hover:bg-muted/10 hover:border-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      dragActive && "border-primary bg-primary/5 text-primary",
                      error &&
                        "border-destructive/50 bg-destructive/5 text-destructive",
                    )}
                    onDragEnter={onDrag}
                    onDragLeave={onDrag}
                    onDragOver={onDrag}
                    onDrop={onDrop}
                    onClick={() => inputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        inputRef.current?.click();
                      }
                    }}
                    aria-label="Upload photo"
                  >
                    <input
                      id={inputId}
                      ref={inputRef}
                      type="file"
                      className="hidden"
                      accept={ALLOWED_TYPES.join(",")}
                      onChange={handleChange}
                    />
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform group-hover:scale-110">
                      <Plus className="h-4 w-4 text-foreground" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      Image
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Placeholder for second slot if needed later, kept hidden or minimal to match UI if user insisted, but for now skipping to avoid confusion */}
          </div>

          {error && (
            <p className="text-sm font-medium text-destructive">{error}</p>
          )}
        </div>

        {/* Text Section */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold leading-tight text-foreground">
              Text
            </h3>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label
                htmlFor="custom-text"
                className="text-sm font-medium text-foreground"
              >
                Name
              </Label>
              <p className="text-xs text-muted-foreground">
                Add the employee name
              </p>
            </div>
            <div className="relative">
              <Input
                id="custom-text"
                placeholder="Charles"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                maxLength={15}
                className="pr-12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {textInput.length}/15
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6">
        <Button
          className="w-full rounded-lg bg-foreground py-6 text-base font-semibold text-background hover:bg-foreground/90"
          size="lg"
          onClick={handleGenerate}
        >
          Continue
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          By continuing you agree to the{" "}
          <a
            className="underline underline-offset-4 hover:text-foreground"
            href="/policies/terms-of-service"
          >
            terms of service
          </a>
        </p>
      </div>
    </div>
  );
};
