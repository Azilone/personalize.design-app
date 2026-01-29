import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Eye,
  Image as ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
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
import { cn, formatVariableLabel } from "../lib/utils";

type ModalState = "editing" | "generating" | "reveal" | "preview" | "review";

const PLACEHOLDER_IMAGE_URL =
  "https://placehold.co/600x400?text=Heretext+Hello+World";
const APP_PROXY_BASE = "/apps/personalize";

const MOCKUP_LOADING_TIMEOUT_MS = 30000;

const WAITING_MESSAGES = [
  "The AI is pondering existence...",
  "Adding a pinch of creativity...",
  "Consulting the design spirits...",
  "Painting with digital pixels...",
  "The magic is happening...",
  "Almost there, we promise!",
  "Our AI is a bit slow today...",
  "Did we mention AI is artistic?",
  "Warming up the creative engines...",
  "Crafting something special...",
] as const;

export const Shell = () => {
  const {
    isOpen,
    close,
    file,
    setFile,
    config,
    templateConfig,
    setTemplateConfig,
    variableValues,
    setVariableValue,
    setVariableValues,
    sessionId,
    previewJobId,
    generationStatus,
    previewUrl,
    generationError,
    serverJobConfirmed,
    mockupUrls,
    mockupStatus,
    mockupError,
    triesRemaining,
    resetInMinutes,
    canRegenerate,
    regenerationCostUsd,
    setPreviewJobId,
    setGenerationStatus,
    setPreviewUrl,
    setGenerationError,
    setServerJobConfirmed,
    setMockupUrls,
    setMockupStatus,
    setMockupError,
    setTriesRemaining,
    setPerProductTriesRemaining,
    setPerSessionTriesRemaining,
    setResetAt,
    setResetInMinutes,
    setCanRegenerate,
    setRegenerationCostUsd,
    setSessionId,
    resetPreview,
  } = useStepperStore();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState>("editing");
  const [progress, setProgress] = useState(0);
  const [selectedMockupIndex, setSelectedMockupIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fakeGeneration, setFakeGeneration] = useState(false);
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(
    null,
  );
  const [waitingMessageIndex, setWaitingMessageIndex] = useState(0);
  const [isRetryingMockups, setIsRetryingMockups] = useState(false);
  const [mockupLoadingStartTime, setMockupLoadingStartTime] = useState<
    number | null
  >(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerationError, setRegenerationError] = useState<string | null>(
    null,
  );
  const logoInputRef = useRef<HTMLInputElement>(null);
  const logoUrlRef = useRef<string | null>(null);
  const templateVariables = templateConfig?.variables ?? [];
  const isDev = import.meta.env?.MODE === "development";

  const sessionStorageKey = useMemo(() => {
    if (!config.shopDomain || !config.productId || !config.templateId) {
      return null;
    }
    return `personalize_session_${config.shopDomain}_${config.productId}_${config.templateId}`;
  }, [config.shopDomain, config.productId, config.templateId]);

  useEffect(() => {
    if (!sessionStorageKey) {
      return;
    }

    let storedSessionId: string | null = null;
    try {
      storedSessionId = window.sessionStorage.getItem(sessionStorageKey);
    } catch {
      storedSessionId = null;
    }

    if (storedSessionId) {
      if (sessionId !== storedSessionId) {
        setSessionId(storedSessionId);
      }
      return;
    }

    const newSessionId = crypto.randomUUID();
    try {
      window.sessionStorage.setItem(sessionStorageKey, newSessionId);
    } catch {
      // Ignore storage errors
    }
    setSessionId(newSessionId);
  }, [sessionId, sessionStorageKey, setSessionId]);

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
    if (!isOpen) {
      setModalState("editing");
      setProgress(0);
      setSelectedMockupIndex(0);
      setError(null);
      setFakeGeneration(false);
      resetPreview();
    }
  }, [isOpen, resetPreview]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (generationStatus === "succeeded") {
      setProgress(100);
    } else if (generationStatus === "failed") {
      setProgress(0);
      setGenerationStartTime(null);
      setWaitingMessageIndex(0);
    } else if (generationStatus === "idle" && modalState !== "generating") {
      setProgress(0);
      setGenerationStartTime(null);
      setWaitingMessageIndex(0);
    }
  }, [generationStatus, isOpen, modalState]);

  useEffect(() => {
    if (modalState !== "generating") {
      return;
    }

    if (!generationStartTime) {
      setGenerationStartTime(Date.now());
      return;
    }

    const startTime = generationStartTime;
    const FAKE_DURATION = 15000;
    const MESSAGE_CYCLE_INTERVAL = 4000;
    let cancelled = false;

    const animateProgress = () => {
      if (cancelled) {
        return;
      }

      const elapsed = Date.now() - startTime;
      const progressValue = Math.min((elapsed / FAKE_DURATION) * 100, 95);
      setProgress(progressValue);

      if (elapsed < FAKE_DURATION) {
        requestAnimationFrame(animateProgress);
      }
    };

    const messageInterval = setInterval(() => {
      if (cancelled) {
        return;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed > FAKE_DURATION) {
        setWaitingMessageIndex((prev) => (prev + 1) % WAITING_MESSAGES.length);
      }
    }, MESSAGE_CYCLE_INTERVAL);

    requestAnimationFrame(animateProgress);

    return () => {
      cancelled = true;
      clearInterval(messageInterval);
    };
  }, [modalState, generationStatus, generationStartTime]);

  useEffect(() => {
    const shopDomain = config.shopDomain;
    if (!previewJobId || !shopDomain) {
      return;
    }

    const shouldPollForMockups =
      generationStatus === "succeeded" &&
      mockupStatus !== "ready" &&
      mockupStatus !== "error";

    if (
      !["pending", "processing"].includes(generationStatus) &&
      !shouldPollForMockups
    ) {
      return;
    }

    if (!serverJobConfirmed) {
      return;
    }

    const statusUrl = `${APP_PROXY_BASE}/generate-preview-status?job_id=${encodeURIComponent(
      previewJobId,
    )}&shop_id=${encodeURIComponent(shopDomain)}`;

    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(statusUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          throw new Error(
            "Preview service is unavailable. Please try again in a moment.",
          );
        }
        const payload = (await response.json()) as {
          data?: {
            status?: string;
            preview_url?: string;
            mockup_urls?: string[];
            mockup_status?: "loading" | "ready" | "error";
            error?: string;
            // Limit tracking fields
            tries_remaining?: number;
            per_product_tries_remaining?: number;
            per_session_tries_remaining?: number;
            reset_at?: string;
            reset_in_minutes?: number;
            can_regenerate?: boolean;
          };
          error?: { message?: string };
        };

        if (cancelled) {
          return;
        }

        if (!response.ok || payload.error) {
          setGenerationStatus("failed");
          setGenerationError(
            payload.error?.message ??
              "Something went wrong while checking preview status.",
          );
          setModalState("editing");
          return;
        }

        const nextStatus = payload.data?.status as
          | "pending"
          | "processing"
          | "succeeded"
          | "failed"
          | undefined;
        if (nextStatus) {
          setGenerationStatus(nextStatus);
        }
        if (payload.data?.preview_url) {
          setPreviewUrl(payload.data.preview_url);
        }
        if (payload.data?.mockup_urls) {
          setMockupUrls(payload.data.mockup_urls);
        }
        if (payload.data?.mockup_status) {
          setMockupStatus(payload.data.mockup_status);
          if (
            payload.data.mockup_status === "loading" &&
            !mockupLoadingStartTime
          ) {
            setMockupLoadingStartTime(Date.now());
          } else if (payload.data.mockup_status !== "loading") {
            setMockupLoadingStartTime(null);
          }
        } else if (
          nextStatus === "succeeded" &&
          (!payload.data?.mockup_urls || payload.data.mockup_urls.length === 0)
        ) {
          setMockupStatus("loading");
          if (!mockupLoadingStartTime) {
            setMockupLoadingStartTime(Date.now());
          }
        }
        if (payload.data?.error) {
          setGenerationError(payload.data.error);
        }

        // Update limit tracking from status response
        if (payload.data?.tries_remaining !== undefined) {
          setTriesRemaining(payload.data.tries_remaining);
        }
        if (payload.data?.per_product_tries_remaining !== undefined) {
          setPerProductTriesRemaining(payload.data.per_product_tries_remaining);
        }
        if (payload.data?.per_session_tries_remaining !== undefined) {
          setPerSessionTriesRemaining(payload.data.per_session_tries_remaining);
        }
        if (payload.data?.reset_at !== undefined) {
          setResetAt(payload.data.reset_at);
        }
        if (payload.data?.reset_in_minutes !== undefined) {
          setResetInMinutes(payload.data.reset_in_minutes);
        }
        if (payload.data?.can_regenerate !== undefined) {
          setCanRegenerate(payload.data.can_regenerate);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps

        if (nextStatus === "succeeded" && modalState === "generating") {
          setTimeout(() => {
            setModalState("reveal");
          }, 500);
          return;
        }
        if (nextStatus === "failed") {
          setModalState("editing");
          return;
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setGenerationStatus("failed");
        setGenerationError(
          error instanceof Error
            ? error.message
            : "Preview service is unavailable. Please try again in a moment.",
        );
        setModalState("editing");
      }
    };

    const intervalId = window.setInterval(poll, 2000);
    poll();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    previewJobId,
    config.shopDomain,
    generationStatus,
    modalState,
    serverJobConfirmed,
    setGenerationError,
    setGenerationStatus,
    setPreviewUrl,
    setMockupStatus,
    setMockupUrls,
    mockupStatus,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const shopDomain = config.shopDomain;
    const templateId = config.templateId;
    if (!shopDomain || !templateId) {
      return;
    }

    let cancelled = false;

    const loadTemplateConfig = async () => {
      try {
        const response = await fetch(
          `${APP_PROXY_BASE}/template-config?shop_id=${encodeURIComponent(
            shopDomain,
          )}&template_id=${encodeURIComponent(templateId)}`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
          },
        );
        const contentType = response.headers.get("content-type") ?? "";
        const rawBody = await response.text();
        let payload:
          | {
              data?: {
                template_id: string;
                template_name: string;
                photo_required: boolean;
                text_input_enabled: boolean;
                variables: Array<{ id: string; name: string }>;
              };
              error?: { message?: string };
            }
          | undefined;

        if (rawBody && contentType.includes("application/json")) {
          try {
            payload = JSON.parse(rawBody) as {
              data?: {
                template_id: string;
                template_name: string;
                photo_required: boolean;
                text_input_enabled: boolean;
                variables: Array<{ id: string; name: string }>;
              };
              error?: { message?: string };
            };
          } catch {
            payload = undefined;
          }
        }

        if (cancelled) {
          return;
        }

        if (!response.ok || payload?.error || !payload?.data) {
          const fallbackMessage = response.ok
            ? "Unable to load template configuration."
            : `Template configuration is unavailable (status ${response.status}).`;
          throw new Error(payload?.error?.message ?? fallbackMessage);
        }

        setTemplateConfig({
          templateId: payload.data.template_id,
          templateName: payload.data.template_name,
          photoRequired: payload.data.photo_required,
          textInputEnabled: payload.data.text_input_enabled,
          variables: payload.data.variables,
        });

        const nextValues = payload.data.variables.reduce<
          Record<string, string>
        >((acc, variable) => {
          acc[variable.name] = variableValues[variable.name] ?? "";
          return acc;
        }, {});
        const hasChanges =
          Object.keys(nextValues).length !==
            Object.keys(variableValues).length ||
          Object.entries(nextValues).some(
            ([key, value]) => variableValues[key] !== value,
          );
        if (hasChanges) {
          setVariableValues(nextValues);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setError(
          error instanceof Error
            ? error.message
            : "Unable to load template configuration.",
        );
      }
    };

    loadTemplateConfig();

    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    config.shopDomain,
    config.templateId,
    setTemplateConfig,
    setVariableValues,
    variableValues,
  ]);

  const title = config.variantTitle
    ? `Personalizing - ${config.variantTitle}`
    : config.productTitle
      ? `Personalizing - ${config.productTitle}`
      : "Personalizing";
  const productImageUrl = config.productImageUrl || PLACEHOLDER_IMAGE_URL;
  const heroImageUrl = previewUrl || productImageUrl;
  const scratchSize = isDesktop ? 500 : 280;

  const mockupImages = useMemo(() => {
    if (mockupUrls.length > 0) {
      return mockupUrls.map((url, index) => ({
        id: index + 1,
        label: `View ${index + 1}`,
        url,
      }));
    }
    // If no mockups yet but we have a previewUrl, show that as the main image
    // This allows users to see their design while mockups are loading
    if (previewUrl) {
      return [{ id: 1, label: "Your Design", url: previewUrl }];
    }
    // Fallback to product image if nothing else available
    return [{ id: 1, label: "Product View", url: productImageUrl }];
  }, [mockupUrls, previewUrl, productImageUrl]);

  const mainImageUrl =
    modalState === "review"
      ? mockupImages[selectedMockupIndex]?.url || PLACEHOLDER_IMAGE_URL
      : previewUrl || productImageUrl;
  const generateLabel = generationError ? "Try again" : "Generate";
  const isGenerating =
    generationStatus === "pending" || generationStatus === "processing";
  const errorMessage = error ?? generationError;
  const isWaitingLong =
    generationStartTime && Date.now() - generationStartTime > 15000;
  const waitingMessage = WAITING_MESSAGES[waitingMessageIndex];

  const isMockupLoadingLong =
    mockupLoadingStartTime &&
    Date.now() - mockupLoadingStartTime > MOCKUP_LOADING_TIMEOUT_MS;

  const personalizationItems = useMemo(() => {
    const items = [] as Array<{
      id: string;
      type: "image" | "text";
      icon: typeof ImageIcon;
      label: string;
      isVisible: boolean;
    }>;

    items.push({
      id: "image",
      type: "image",
      icon: ImageIcon,
      label: file?.name ?? "Image",
      isVisible: Boolean(file),
    });

    templateVariables.forEach((variable) => {
      const value = variableValues[variable.name]?.trim();
      items.push({
        id: `text-${variable.id}`,
        type: "text",
        icon: Type,
        label: value
          ? `${formatVariableLabel(variable.name)}: ${value}`
          : formatVariableLabel(variable.name),
        isVisible: Boolean(value),
      });
    });

    return items.filter((item) => item.isVisible);
  }, [file, templateVariables, variableValues]);

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
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
    // Always set to file since we only have one upload now
    setFile(selectedFile);
  };

  const handleGenerate = async () => {
    const isGenerating =
      generationStatus === "pending" || generationStatus === "processing";
    if (isGenerating) {
      return;
    }

    if (!file) {
      setError("Please upload an image to proceed.");
      return;
    }
    if (!config.shopDomain || !config.productId || !config.templateId) {
      const missing = [
        !config.shopDomain ? "shop_domain" : null,
        !config.productId ? "product_id" : null,
        !config.templateId ? "template_id" : null,
      ].filter(Boolean);
      setError(
        `Missing product configuration for preview generation (${missing.join(
          ", ",
        )}).`,
      );
      return;
    }

    setError(null);
    setGenerationError(null);
    setPreviewUrl(null);
    setServerJobConfirmed(false);

    let jobId = sessionId;
    if (!jobId) {
      jobId = crypto.randomUUID();
      if (sessionStorageKey) {
        try {
          window.sessionStorage.setItem(sessionStorageKey, jobId);
        } catch {
          // Ignore storage errors
        }
      }
      setSessionId(jobId);
    }
    setModalState("generating");

    const formData = new FormData();
    formData.append("shop_id", config.shopDomain);
    formData.append("product_id", config.productId);
    formData.append("template_id", config.templateId);
    formData.append("session_id", jobId);
    formData.append("image_file", file);
    if (isDev && fakeGeneration) {
      formData.append("fake_generation", "true");
    }

    if (templateVariables.length > 0) {
      const variablePayload = templateVariables.reduce<Record<string, string>>(
        (acc, variable) => {
          const value = variableValues[variable.name]?.trim();
          if (value) {
            acc[variable.name] = value;
          }
          return acc;
        },
        {},
      );
      if (Object.keys(variablePayload).length > 0) {
        formData.append(
          "variable_values_json",
          JSON.stringify(variablePayload),
        );
      }
    }

    try {
      const response = await fetch(`${APP_PROXY_BASE}/generate-preview`, {
        method: "POST",
        body: formData,
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error(
          "Preview service is unavailable. Please try again in a moment.",
        );
      }
      const payload = (await response.json()) as {
        data?: { job_id: string; status: string };
        error?: { message?: string };
      };

      if (!response.ok || payload.error) {
        setGenerationStatus("failed");
        setServerJobConfirmed(false);
        setGenerationError(
          payload.error?.message ??
            "Something went wrong while starting preview generation.",
        );
        setModalState("editing");
        return;
      }

      const nextJobId = payload.data?.job_id ?? jobId;
      setPreviewJobId(nextJobId);
      setServerJobConfirmed(true);
      setGenerationStatus(
        (payload.data?.status as
          | "pending"
          | "processing"
          | "succeeded"
          | "failed") ?? "pending",
      );
    } catch (error) {
      setGenerationStatus("failed");
      setServerJobConfirmed(false);
      setGenerationError(
        error instanceof Error
          ? error.message
          : "Preview service is unavailable. Please try again in a moment.",
      );
      setModalState("editing");
    }
  };

  const handleScratchComplete = () => {
    setModalState("preview");
  };

  const handlePreview = () => {
    setModalState("review");
  };

  const handleRetryMockups = async () => {
    if (!previewJobId || !config.shopDomain) return;

    setIsRetryingMockups(true);
    setMockupStatus("loading");
    setMockupError(null);

    try {
      const response = await fetch(
        `${APP_PROXY_BASE}/retry-mockups?job_id=${encodeURIComponent(previewJobId)}&shop_id=${encodeURIComponent(config.shopDomain)}`,
        {
          method: "POST",
          headers: { Accept: "application/json" },
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setMockupError(
          payload.error?.message || "Failed to retry mockup generation",
        );
        setMockupStatus("error");
      }
    } catch (error) {
      setMockupError(
        error instanceof Error
          ? error.message
          : "Failed to retry mockup generation",
      );
      setMockupStatus("error");
    } finally {
      setIsRetryingMockups(false);
    }
  };

  const handleRegenerate = async () => {
    if (!config.shopDomain || !config.productId || !config.templateId) {
      return;
    }

    let activeSessionId = sessionId ?? previewJobId;
    if (!activeSessionId) {
      activeSessionId = crypto.randomUUID();
      if (sessionStorageKey) {
        try {
          window.sessionStorage.setItem(sessionStorageKey, activeSessionId);
        } catch {
          // Ignore storage errors
        }
      }
      setSessionId(activeSessionId);
    }

    if (!previewJobId) {
      setRegenerationError("Please generate a preview before trying again.");
      return;
    }

    // Check if regeneration is allowed
    if (!canRegenerate) {
      setRegenerationError(
        resetInMinutes
          ? `You've reached your generation limit. Try again in ${resetInMinutes} minutes.`
          : "You've reached your generation limit.",
      );
      return;
    }

    setIsRegenerating(true);
    setRegenerationError(null);
    setGenerationError(null);
    setPreviewUrl(null);
    setServerJobConfirmed(false);
    setMockupUrls([]);
    setMockupStatus("idle");
    setMockupError(null);

    try {
      const formData = new FormData();
      formData.append("shop_id", config.shopDomain);
      formData.append("product_id", config.productId);
      formData.append("template_id", config.templateId);
      formData.append("session_id", activeSessionId);
      formData.append("previous_job_id", previewJobId);
      if (isDev && fakeGeneration) {
        formData.append("fake_generation", "true");
      }

      const response = await fetch(`${APP_PROXY_BASE}/regenerate-preview`, {
        method: "POST",
        body: formData,
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error(
          "Preview service is unavailable. Please try again in a moment.",
        );
      }

      const payload = (await response.json()) as {
        data?: {
          job_id: string;
          status: string;
          tries_remaining?: number;
          per_product_tries_remaining?: number;
          per_session_tries_remaining?: number;
          reset_at?: string;
          reset_in_minutes?: number;
          cost_usd?: number;
        };
        error?: { message?: string; code?: string };
      };

      if (!response.ok || payload.error) {
        setGenerationStatus("failed");
        setServerJobConfirmed(false);
        setRegenerationError(
          payload.error?.message ??
            "Something went wrong while starting preview regeneration.",
        );

        // Update limit info from error response
        if (payload.error?.code === "limit_exceeded") {
          setCanRegenerate(false);
        }
        return;
      }

      // Update limit tracking from response
      if (payload.data?.tries_remaining !== undefined) {
        setTriesRemaining(payload.data.tries_remaining);
      }
      if (payload.data?.per_product_tries_remaining !== undefined) {
        setPerProductTriesRemaining(payload.data.per_product_tries_remaining);
      }
      if (payload.data?.per_session_tries_remaining !== undefined) {
        setPerSessionTriesRemaining(payload.data.per_session_tries_remaining);
      }
      if (payload.data?.reset_at !== undefined) {
        setResetAt(payload.data.reset_at);
      }
      if (payload.data?.reset_in_minutes !== undefined) {
        setResetInMinutes(payload.data.reset_in_minutes);
      }
      if (payload.data?.cost_usd !== undefined) {
        setRegenerationCostUsd(payload.data.cost_usd);
      }

      const nextJobId = payload.data?.job_id ?? previewJobId;
      setPreviewJobId(nextJobId);
      setServerJobConfirmed(true);
      setGenerationStatus(
        (payload.data?.status as
          | "pending"
          | "processing"
          | "succeeded"
          | "failed") ?? "pending",
      );
      setModalState("generating");
    } catch (error) {
      setGenerationStatus("failed");
      setServerJobConfirmed(false);
      setRegenerationError(
        error instanceof Error
          ? error.message
          : "Preview service is unavailable. Please try again in a moment.",
      );
    } finally {
      setIsRegenerating(false);
    }
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
    <div className="flex h-full flex-col font-['Helvetica',_'Arial',_sans-serif]">
      <div className="flex items-center justify-between border-b border-border px-[20px] py-[16px] lg:px-[32px] lg:py-[24px]">
        <div className="min-w-0 flex-1 mr-4">
          <TitleComponent className="text-[20px] font-bold text-foreground lg:text-[30px] truncate">
            {title}
          </TitleComponent>
          <DescriptionComponent className="sr-only">
            Customize your product with AI
          </DescriptionComponent>
        </div>
        <div className="flex items-center gap-[12px]">
          <button
            type="button"
            onClick={close}
            className="rounded-[2px] opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Close personalization dialog"
          >
            <X className="h-[24px] w-[24px]" />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="flex w-full flex-1 flex-col border-b border-border lg:border-b-0 lg:border-r min-h-[55vh] lg:min-h-0 overflow-y-auto">
          <div className="flex items-center justify-between px-[20px] pt-[20px] lg:px-[32px] lg:pt-[24px]">
            <span className="text-[16px] text-muted-foreground lg:text-[18px]">
              {modalState === "review"
                ? mockupImages[selectedMockupIndex]?.label
                : "Front"}
            </span>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-[20px] lg:p-[32px]">
            {modalState === "generating" ? (
              <div className="flex flex-col items-center justify-center gap-[24px] animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out">
                <AnimatedCircularProgressBar
                  value={Math.floor(progress / 10) * 10}
                  max={100}
                  min={0}
                  gaugePrimaryColor="#1a3a4a"
                  gaugeSecondaryColor="rgba(26, 58, 74, 0.2)"
                  className="size-[160px]"
                />
                <p className="text-[18px] text-muted-foreground">
                  {isWaitingLong ? waitingMessage : "Generating your design..."}
                </p>
              </div>
            ) : modalState === "reveal" ? (
              <div className="flex flex-col items-center justify-center gap-[24px] animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out">
                <p className="text-[18px] text-muted-foreground">
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
                      src={heroImageUrl}
                      alt={config.productTitle ?? "Product"}
                      className="h-full w-full object-contain"
                    />
                  </div>
                </ScratchToReveal>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-[16px] text-muted-foreground animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out">
                <div className="relative h-full w-full max-w-full lg:max-w-[800px]">
                  <img
                    src={mainImageUrl}
                    alt={config.productTitle ?? "Product"}
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>
            )}
          </div>
          {modalState === "review" && (
            <div className="px-[20px] pb-[20px] lg:px-[32px] lg:pb-[32px]">
              <Carousel
                opts={{ align: "start" }}
                className="mx-auto w-full max-w-[500px] lg:max-w-[672px]"
              >
                <CarouselContent className="-ml-[8px]">
                  {mockupImages.map((mockup, index) => (
                    <CarouselItem
                      key={mockup.id}
                      className="basis-1/2 sm:basis-1/3 lg:basis-1/4 pl-[8px]"
                    >
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
                          className="h-full w-full object-contain p-[4px]"
                        />
                      </button>
                      <p className="mt-[4px] truncate text-center text-[14px] text-muted-foreground">
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
        <div className="flex flex-1 w-full flex-col lg:h-full lg:w-[400px] min-h-0">
          {modalState === "editing" && (
            <>
              <div className="flex-1 overflow-y-auto p-[20px] lg:p-[32px]">
                <div className="mb-[20px] lg:mb-[32px]">
                  <h3 className="mb-[16px] text-[18px] font-semibold text-foreground lg:mb-[24px] lg:text-[20px]">
                    Images
                  </h3>
                  <div className="mb-[16px] lg:mb-[24px]">
                    <Label className="text-[16px] font-medium text-foreground lg:text-[18px]">
                      {templateConfig?.photoRequired
                        ? "Reference image"
                        : "Image"}
                    </Label>
                    <p className="mb-[8px] text-[14px] text-muted-foreground lg:mb-[12px] lg:text-[16px]">
                      {templateConfig?.templateName
                        ? `Add an image for ${templateConfig.templateName}.`
                        : config.productTitle
                          ? `Add an image for ${config.productTitle}.`
                          : "Add an image to personalize your product."}
                    </p>
                    <div className="flex items-center gap-[16px]">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(event) => handleImageUpload(event)}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="flex h-[80px] w-[80px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-border transition-colors hover:border-primary/50 hover:bg-muted/50"
                      >
                        <Plus className="size-[24px] text-muted-foreground" />
                        <span className="mt-[4px] text-[14px] text-muted-foreground">
                          Image
                        </span>
                      </button>
                      {logoPreviewUrl && (
                        <div className="relative">
                          <div className="h-[80px] w-[80px] overflow-hidden rounded-lg border-2 border-primary/50 bg-muted">
                            <img
                              src={logoPreviewUrl}
                              alt="Logo preview"
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setFile(null)}
                            className="absolute -right-[8px] -top-[8px] rounded-full bg-primary p-[2px] text-primary-foreground transition-colors hover:bg-primary/80"
                            aria-label="Remove logo"
                          >
                            <X className="size-[16px]" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {templateVariables.length > 0 && (
                  <div>
                    <h3 className="mb-[16px] text-[18px] font-semibold text-foreground lg:mb-[24px] lg:text-[20px]">
                      Text
                    </h3>
                    <div className="space-y-[16px]">
                      {templateVariables.map((variable) => {
                        const label = formatVariableLabel(variable.name);
                        return (
                          <div key={variable.id}>
                            <Label
                              htmlFor={`variable-${variable.id}`}
                              className="text-[16px] font-medium text-foreground lg:text-[18px]"
                            >
                              {label}
                            </Label>
                            <div className="relative mt-[8px]">
                              <Input
                                id={`variable-${variable.id}`}
                                value={variableValues[variable.name] ?? ""}
                                onChange={(event) =>
                                  setVariableValue(
                                    variable.name,
                                    event.target.value,
                                  )
                                }
                                placeholder={`Enter ${label.toLowerCase()}`}
                                className="flex w-full rounded-md border border-input bg-transparent py-1 shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 h-[48px] px-[16px]"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-[12px] border-t border-border p-[20px] lg:space-y-[16px] lg:p-[32px]">
                {errorMessage && (
                  <p className="text-[12px] font-medium text-destructive">
                    {errorMessage}
                  </p>
                )}
                {isDev && (
                  <label className="flex items-center gap-[8px] text-[12px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={fakeGeneration}
                      onChange={(event) =>
                        setFakeGeneration(event.target.checked)
                      }
                      className="h-[14px] w-[14px] rounded border border-input"
                    />
                    Dev mode: skip AI generation
                  </label>
                )}
                <Button
                  onClick={handleGenerate}
                  className="w-full bg-[#1a3a4a] text-white hover:bg-[#1a3a4a]/90 h-[48px] text-[16px] lg:h-[56px] lg:text-[18px]"
                  size="lg"
                  disabled={isGenerating}
                >
                  {generateLabel}
                </Button>
                <p className="text-center text-[12px] text-muted-foreground lg:text-[14px]">
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
            <div className="flex flex-1 flex-col items-center justify-center p-[24px]">
              <p className="mb-[8px] text-[16px] font-semibold text-foreground">
                Creating your design
              </p>
              <p className="text-center text-[16px] text-muted-foreground">
                {isWaitingLong
                  ? waitingMessage
                  : "Please wait while we generate your personalized product..."}
              </p>
            </div>
          )}

          {modalState === "reveal" && (
            <div className="flex flex-1 flex-col items-center justify-center p-[24px]">
              <p className="mb-[8px] text-[16px] font-semibold text-foreground">
                Your design is ready!
              </p>
              <p className="text-center text-[16px] text-muted-foreground">
                Scratch the image to reveal your personalized design.
              </p>
            </div>
          )}

          {modalState === "preview" && (
            <>
              <div className="flex flex-1 flex-col items-center justify-center p-[24px]">
                <p className="mb-[8px] text-[16px] font-semibold text-foreground">
                  Design Generated!
                </p>
                <p className="text-center text-[16px] text-muted-foreground">
                  {mockupStatus === "loading"
                    ? "Mockups are still generating. You can preview your design now."
                    : mockupStatus === "error"
                      ? "Mockups failed to load. You can still preview your design."
                      : "Click Preview to see your design on different mockups."}
                </p>
                {/* Tries remaining and reset timer */}
                {triesRemaining !== null && (
                  <div className="mt-[16px] text-center">
                    <p className="text-[14px] text-muted-foreground">
                      {triesRemaining > 0 ? (
                        <>
                          <span className="font-medium text-foreground">
                            {triesRemaining}
                          </span>{" "}
                          {triesRemaining === 1 ? "try" : "tries"} remaining
                          {resetInMinutes !== null && resetInMinutes > 0 && (
                            <span> · Resets in {resetInMinutes} min</span>
                          )}
                        </>
                      ) : (
                        <span className="text-destructive">
                          No tries remaining
                          {resetInMinutes !== null && resetInMinutes > 0 && (
                            <> · Resets in {resetInMinutes} min</>
                          )}
                        </span>
                      )}
                    </p>
                    {regenerationCostUsd !== null && triesRemaining > 0 && (
                      <p className="mt-[4px] text-[12px] text-muted-foreground">
                        Cost: ${regenerationCostUsd.toFixed(3)}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-[12px] border-t border-border p-[24px]">
                {/* Try Again button for regeneration */}
                {triesRemaining !== null && triesRemaining > 0 && (
                  <Button
                    onClick={handleRegenerate}
                    variant="outline"
                    className="w-full bg-transparent h-[48px] text-[16px]"
                    size="lg"
                    disabled={isRegenerating || !canRegenerate}
                  >
                    {isRegenerating ? (
                      <>
                        <Loader2 className="mr-[8px] size-[16px] animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-[8px] size-[16px]" />
                        Try again
                      </>
                    )}
                  </Button>
                )}
                {/* Blocked state messaging */}
                {triesRemaining !== null && triesRemaining === 0 && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-[16px]">
                    <p className="text-[14px] text-destructive">
                      Generation limit reached
                    </p>
                    <p className="mt-[4px] text-[12px] text-muted-foreground">
                      {resetInMinutes !== null && resetInMinutes > 0
                        ? `You can generate again in ${resetInMinutes} minutes.`
                        : "Please try again later."}
                    </p>
                  </div>
                )}
                {regenerationError && (
                  <p className="text-[12px] font-medium text-destructive">
                    {regenerationError}
                  </p>
                )}
                <Button
                  onClick={handlePreview}
                  variant="outline"
                  className="w-full bg-transparent h-[48px] text-[16px]"
                  size="lg"
                >
                  {mockupStatus === "loading" ? (
                    <>
                      <Loader2 className="mr-[8px] size-[16px] animate-spin" />
                      Preview now
                    </>
                  ) : (
                    <>
                      <Eye className="mr-[8px] size-[16px]" />
                      Preview
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleSaveDesign}
                  className="w-full bg-[#1a3a4a] text-white hover:bg-[#1a3a4a]/90 h-[48px] text-[16px]"
                  size="lg"
                >
                  Save design
                </Button>
              </div>
            </>
          )}

          {modalState === "review" && (
            <>
              <div className="flex-1 overflow-y-auto p-[32px]">
                <h3 className="mb-[8px] text-[24px] font-bold text-foreground">
                  Review your design
                </h3>
                <p className="mb-[24px] text-[16px] text-muted-foreground">
                  Personalization
                </p>
                <div className="space-y-[8px]">
                  {personalizationItems.length > 0 ? (
                    personalizationItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="flex w-full items-center justify-between rounded-lg border border-border p-[12px] text-left transition-colors hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-[12px]">
                          <item.icon className="size-[20px] text-muted-foreground" />
                          <span className="text-[16px] text-foreground">
                            {item.label}
                          </span>
                        </div>
                        <ChevronRight className="size-[16px] text-muted-foreground" />
                      </button>
                    ))
                  ) : (
                    <p className="py-[16px] text-center text-[16px] text-muted-foreground">
                      No personalizations added yet.
                    </p>
                  )}
                </div>

                {/* Mockup status indicator */}
                {mockupStatus === "loading" && (
                  <div className="mt-[24px] rounded-lg border border-border bg-muted/30 p-[16px]">
                    <p className="text-[14px] text-muted-foreground">
                      {isMockupLoadingLong
                        ? "Mockups are taking longer than expected. Please wait a bit longer..."
                        : "Generating product mockups..."}
                    </p>
                  </div>
                )}
                {mockupStatus === "error" && (
                  <div className="mt-[24px] rounded-lg border border-destructive/20 bg-destructive/10 p-[16px]">
                    <p className="mb-[8px] text-[14px] text-destructive">
                      {mockupError || "Failed to generate mockups"}
                    </p>
                    <Button
                      onClick={handleRetryMockups}
                      variant="outline"
                      size="sm"
                      disabled={isRetryingMockups}
                      className="text-[14px]"
                    >
                      {isRetryingMockups ? "Retrying..." : "Try again"}
                    </Button>
                  </div>
                )}

                {/* Tries remaining indicator in review state */}
                {triesRemaining !== null && (
                  <div className="mt-[24px] rounded-lg border border-border bg-muted/30 p-[16px]">
                    <div className="flex items-center justify-between">
                      <p className="text-[14px] text-muted-foreground">
                        {triesRemaining > 0 ? (
                          <>
                            <span className="font-medium text-foreground">
                              {triesRemaining}
                            </span>{" "}
                            {triesRemaining === 1 ? "try" : "tries"} remaining
                          </>
                        ) : (
                          <span className="text-destructive">
                            No tries remaining
                          </span>
                        )}
                      </p>
                      {resetInMinutes !== null && resetInMinutes > 0 && (
                        <p className="text-[12px] text-muted-foreground">
                          Resets in {resetInMinutes} min
                        </p>
                      )}
                    </div>
                    {regenerationCostUsd !== null && triesRemaining > 0 && (
                      <p className="mt-[4px] text-[12px] text-muted-foreground">
                        Cost: ${regenerationCostUsd.toFixed(3)} per generation
                      </p>
                    )}
                  </div>
                )}

                {/* Regenerate button in review state */}
                {triesRemaining !== null && triesRemaining > 0 && (
                  <div className="mt-[16px]">
                    <Button
                      onClick={handleRegenerate}
                      variant="outline"
                      className="w-full bg-transparent h-[48px] text-[16px]"
                      size="lg"
                      disabled={isRegenerating || !canRegenerate}
                    >
                      {isRegenerating ? (
                        <>
                          <Loader2 className="mr-[8px] size-[16px] animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-[8px] size-[16px]" />
                          Try again
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {/* Blocked state messaging in review state */}
                {triesRemaining !== null && triesRemaining === 0 && (
                  <div className="mt-[16px] rounded-lg border border-destructive/20 bg-destructive/10 p-[16px]">
                    <p className="text-[14px] text-destructive">
                      Generation limit reached
                    </p>
                    <p className="mt-[4px] text-[12px] text-muted-foreground">
                      {resetInMinutes !== null && resetInMinutes > 0
                        ? `You can generate again in ${resetInMinutes} minutes.`
                        : "Please try again later."}
                    </p>
                  </div>
                )}
                {regenerationError && (
                  <p className="mt-[12px] text-[12px] font-medium text-destructive">
                    {regenerationError}
                  </p>
                )}
              </div>
              <div className="border-t border-border p-[24px]">
                <div className="flex gap-[12px]">
                  <Button
                    onClick={handleBack}
                    variant="outline"
                    className="flex-1 bg-transparent h-[48px] text-[16px]"
                    size="lg"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleSaveDesign}
                    className="flex-1 bg-[#1a3a4a] text-white hover:bg-[#1a3a4a]/90 h-[48px] text-[16px]"
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
          className="pd-stepper-theme fixed z-50 flex h-[90vh] w-[90vw] max-w-[1600px] flex-col overflow-hidden rounded-lg bg-white p-0 shadow-xl"
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
