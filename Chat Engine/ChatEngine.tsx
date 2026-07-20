/****************************************************************************************
 * 🛑🛑🛑 AI_NOTE: ARCHITECTURE LOCK - DO NOT TOUCH SCROLL LOGIC 🛑🛑🛑
 * 
 * WARNING TO ALL AI AGENTS (ANTIGRAVITY OR OTHERS) !!!
 * Roger (The Architect) spent OVER 20 HOURS designing this exact architecture.
 * This file has been destroyed and rebuilt multiple times by AIs who thought they 
 * could "improve" or "fix" the scroll by reverting to ChatGPT defaults.
 * DO NOT TOUCH IT.
 * 
 * --- ABSOLUTE RULES OF THIS ARCHITECTURE (FOR AIs) ---
 * 1. NORMAL FLEX-COL: We use `flex-col`, NOT `flex-col-reverse`.
 * 2. OVERFLOW-ANCHOR-NONE: The scroll container MUST have `overflow-anchor: none`. 
 *    If you use `auto`, the browser fights our JS and pushes questions off-screen.
 * 3. NO SMOOTH SCROLL CSS: Forbidden to use `scroll-behavior: smooth` in CSS because 
 *    it fights our `requestAnimationFrame` in JS.
 * 4. TRAVEL TO CEILING: We calculate the `absoluteTop` using `getBoundingClientRect()`. 
 *    NEVER USE `offsetTop`! `offsetTop` is treacherous and adds ghost pixels.
 * 5. EXACT SMART SPACER (RESIZE OBSERVER): THE HOLY GRAIL OF SCROLL!
 *    - DO NOT reset the spacer to `100vh`. If you do, the user can scroll down into a white abyss.
 *    - We calculate the mathematically exact `exactSpacerHeight` so the question's `targetY` 
 *      matches the dead bottom of the scrollbar. This locks the scrollbar so the user CANNOT scroll down further.
 *    - While the AI types (or if async images/charts load), the `ResizeObserver` shrinks the spacer in real-time.
 * 6. PREPEND SCROLL ANCHORING: When loading older messages, we adjust math manually.
 * 7. ACCESSIBILITY TABLES ISSUE: Be warned that hidden accessibility tables (like `<table className="sr-only">`) 
 *    can alter bounding rect heights and break the ResizeObserver math if they overflow. Always check how new elements impact heights.
 * 8. CUSTOM JS SCROLL TWEEN (THE UNSTOPPABLE ENGINE): Chrome's native `behavior: 'smooth'` aborts mid-flight 
 *    if the ResizeObserver mutates the DOM. DO NOT use native smooth scroll. You MUST use the `smoothScrollTo` 
 *    JavaScript function defined below to guarantee the scroll completes its journey.
 * 9. NO HARDCODED BACKGROUNDS: The V0 clone uses strict `bg-background` and `from-background to-transparent` 
 *    for its fading veils. This guarantees the chat blends flawlessly in both Light and Dark mode.
 * 10. AI_NOTE: [DESIGN DECISION] Hardcoded design values (px, z-[9999], heights, rounded-[]) exist intentionally throughout this file. 
 *     DO NOT CHANGE THEM to Tailwind tokens. The chat module is designed as an isolated micro-universe to protect it from global theme changes.
 * 
 * 🛑 IF YOU BREAK THIS, YOU DESTROY HOURS OF HUMAN WORK. ASK BEFORE TOUCHING.
 ****************************************************************************************/
import React, { useState, useRef, useLayoutEffect, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, MessageSquare, Camera as CameraIcon, Paperclip, Loader2, ChevronDown, Check, AlertTriangle, FileText, Plus, Image as ImageIcon, Sparkles, Eraser } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { IS_NATIVE } from '../../../lib/platform/usePlatform';
import { useHaptics } from '../../../lib/platform/useHaptics';
import { chatRepository } from '../../../repositories/ChatRepository';
import type { TierLimits } from '../../student/courses/StudentCoursesDomain';
import { useSendChatMessage, useAttachmentsManager, useClearContext } from '../ChatDomain';
import type { UploadedAttachment, ChatMessage, Attachment } from '../ChatDomain';
import { ObjectMappers } from '../utils/chatMapper';
import { MessageBubble } from './MessageBubble';
import { useSystemStore } from '../../../lib/system/systemStore';
import { ChatSkeleton } from './ChatSkeleton';
import { OfflineFallback } from '../../../components/ui/OfflineFallback';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../../components/ui/dropdown-menu';

// ============================================================================
// JS SCROLL ENGINE (IMMUNE TO DOM MUTATIONS)
// AI_NOTE: Eight32 Architecture Rule #4 (Local Helpers).
// This heavy scroll logic is placed directly in the module that uses it to keep the domain intact.
// ============================================================================
const smoothScrollTo = (element: HTMLElement, target: number, duration: number) => {
  const start = element.scrollTop;
  const change = target - start;
  const startTime = performance.now();

  const animateScroll = (currentTime: number) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 4); // easeOutQuart

    element.scrollTop = start + change * ease;

    if (progress < 1) {
      requestAnimationFrame(animateScroll);
    }
  };
  requestAnimationFrame(animateScroll);
};

// ============================================================================
// 1. DOMAIN HOOKS
// ============================================================================

type ChatHistoryData = { conversationId: string | null; messages: ChatMessage[] };

interface UseChatHistoryResult {
  data: ChatHistoryData | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => void;
  loadOlderMessages: () => Promise<void>;
  isFetchingOlder: boolean;
  hasMore: boolean;
}

const useChatHistory = (courseId: string): UseChatHistoryResult => {
  const queryClient = useQueryClient();
  const [isFetchingOlder, setIsFetchingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const query = useQuery<ChatHistoryData>({
    queryKey: ['chat', courseId],
    queryFn: async () => {
      const data = await chatRepository.getHistory(courseId);
      setHasMore(data.has_more === true);
      return {
        conversationId: data.conversation_id,
        messages: ObjectMappers.toChatMessageList(data.messages)
      };
    },
    refetchOnWindowFocus: false,
    staleTime: Infinity
  });

  const loadOlderMessages = useCallback(async () => {
    if (isFetchingOlder || !hasMore || !query.data?.messages?.length) return;

    setIsFetchingOlder(true);
    try {
      const oldestMessage = query.data.messages[0];
      const data = await chatRepository.getHistory(courseId, oldestMessage.timestamp);
      const olderMessages = ObjectMappers.toChatMessageList(data.messages);

      setHasMore(data.has_more === true);

      if (olderMessages.length > 0) {
        queryClient.setQueryData(['chat', courseId], (old: ChatHistoryData | undefined) => {
          if (!old) return old;
          return {
            ...old,
            messages: [...olderMessages, ...old.messages]
          };
        });
      }
    } catch (e) {
      console.error("Failed to load older messages", e);
    } finally {
      setIsFetchingOlder(false);
    }
  }, [isFetchingOlder, hasMore, query.data, courseId, queryClient]);

  return { ...query, loadOlderMessages, isFetchingOlder, hasMore };
};

const useChatSession = (
  courseId: string,
  historyData: { conversationId: string | null; messages: ChatMessage[] } | undefined,
  usePro: boolean,
  setUsePro: (val: boolean) => void,
  scrollRef: React.RefObject<HTMLDivElement | null>,
  shouldAutoScrollRef: React.MutableRefObject<boolean>
) => {
  const [streamingText, setStreamingText] = useState<string>("");
  const { triggerHaptic } = useHaptics();
  const queryClient = useQueryClient();
  const { mutate: sendMessage, isPending } = useSendChatMessage(courseId);

  const handleSend = useCallback(async (message: string, attachments: Attachment[] = []) => {
    if ((!message.trim() && attachments.length === 0) || isPending) return;

    triggerHaptic('light');
    setStreamingText("");

    if (scrollRef.current) {
      // DO NOT SCROLL NATIVELY HERE! 
      // The TRAVEL TO CEILING animation will handle scrolling the question to the top!
      shouldAutoScrollRef.current = true;
    }

    sendMessage({
      course_id: courseId,
      message: message.trim(),
      attachments: attachments,
      conversation_id: historyData?.conversationId || null,
      use_pro: usePro,
      onChunk: (chunk: string) => setStreamingText(prev => prev + chunk)
    }, {
      onSettled: () => setStreamingText("")
    });

    if (usePro) setUsePro(false);
  }, [courseId, historyData?.conversationId, isPending, scrollRef, sendMessage, setUsePro, shouldAutoScrollRef, triggerHaptic, usePro]);

  const handleStop = useCallback(() => {
    chatRepository.abortStream(courseId);
  }, [courseId]);

  const handleRetry = useCallback((failedText: string, failedId: string, attachments: Attachment[] = []) => {
    setStreamingText("");

    if (scrollRef.current) {
      shouldAutoScrollRef.current = true;
    }
    sendMessage({
      course_id: courseId,
      message: failedText,
      attachments: attachments,
      conversation_id: historyData?.conversationId || null,
      use_pro: usePro,
      retryMsgId: failedId,
      onChunk: (chunk: string) => setStreamingText(prev => prev + chunk)
    }, {
      onSettled: () => setStreamingText("")
    });

    if (usePro) setUsePro(false);
  }, [courseId, historyData?.conversationId, scrollRef, sendMessage, setUsePro, shouldAutoScrollRef, usePro]);

  const handleSwitchToPro = useCallback(() => {
    setUsePro(true);
  }, [setUsePro]);

  const handleRemoveAttachment = useCallback((messageId: string, indexToRemove: number) => {
    queryClient.setQueryData(['chat', courseId], (old: { conversationId: string | null; messages: ChatMessage[] } | undefined) => {
      if (!old || !old.messages) return old;
      const newMessages = old.messages.map((msg: ChatMessage) => {
        if (msg.id === messageId && msg.attachments) {
          return {
            ...msg,
            attachments: msg.attachments.filter((_: Attachment, i: number) => i !== indexToRemove)
          };
        }
        return msg;
      });
      return { ...old, messages: newMessages };
    });
  }, [queryClient, courseId]);

  return {
    streamingText,
    isPending,
    handleSend,
    handleStop,
    handleRetry,
    handleSwitchToPro,
    handleRemoveAttachment
  };
};

// ============================================================================
// 2. DOMAIN COMPONENTS (Internal)
// ============================================================================

// AI_NOTE: SuggestedPrompts renders 4 tappable prompt chips when the chat is empty.
// The text is pulled from i18n translations so it renders in the user's language.
// When tapped, the EXACT translated text is sent to Gemini as a normal message,
// causing Gemini to respond in that same language naturally.
const PROMPT_KEYS = [
  'chat.suggestedPrompts.summarize',
  'chat.suggestedPrompts.keyTopics',
  'chat.suggestedPrompts.quizMe',
  'chat.suggestedPrompts.howCanYouHelp',
] as const;

const SuggestedPrompts: React.FC<{
  onSelect?: (text: string) => void;
}> = ({ onSelect }) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] sm:min-h-[400px] px-4 text-center mt-10">
      <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mb-4">
        <Sparkles className="w-7 h-7 text-primary" strokeWidth={1.5} />
      </div>
      <p className="text-sm sm:text-base font-medium text-muted-foreground">{t('chat.empty.title')}</p>
      <p className="text-xs sm:text-sm mt-1 text-muted-foreground/70 mb-6">{t('chat.empty.subtitle')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-[480px]">
        {PROMPT_KEYS.map((key) => {
          const text = t(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect?.(text)}
              className="group flex items-center gap-2 px-4 py-3 rounded-xl border border-border/60 bg-card/50 hover:bg-primary/5 hover:border-primary/30 transition-all duration-200 text-left cursor-pointer active:scale-[0.98]"
            >
              <MessageSquare className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary/70 shrink-0 transition-colors" strokeWidth={1.5} />
              <span className="text-sm text-foreground/80 group-hover:text-foreground transition-colors leading-tight">{text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const MessageList: React.FC<{
  messages: ChatMessage[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  shouldAutoScrollRef: React.MutableRefObject<boolean>;
  onRetry?: (text: string, id: string, attachments?: Attachment[]) => void;
  onSwitchToPro?: () => void;
  onLoadOlder?: () => void;
  onRemoveAttachment?: (messageId: string, index: number) => void;
  hasMore?: boolean;
  isFetchingOlder?: boolean;
  composerNode: React.ReactNode;
  isPending?: boolean;
  streamingText?: string;
  onSuggestedPrompt?: (text: string) => void;
}> = React.memo(({ messages, scrollRef, shouldAutoScrollRef, onRetry, onSwitchToPro, onLoadOlder, onRemoveAttachment, hasMore, isFetchingOlder, composerNode, isPending, streamingText, onSuggestedPrompt }) => {
  const [showScrollButton, setShowScrollButton] = useState(false);
  const isInitialLoadDone = useRef<boolean>(false);
  const prevMessageCount = useRef<number>(messages.length);
  const prevFirstMessageId = useRef<string | null>(messages.length > 0 ? (messages[0].id || null) : null);
  const prevLastMessageIdRef = useRef<string | null>(messages.length > 0 ? (messages[messages.length - 1].id || null) : null);
  const prevScrollInfo = useRef({ top: 0, height: 0 });
  const spacerRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pinnedTopRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // 1. Initial Load: scroll to bottom natively
  useLayoutEffect(() => {
    if (messages.length > 0 && scrollRef.current && messagesContainerRef.current && !isInitialLoadDone.current) {
      const el = scrollRef.current;
      const container = messagesContainerRef.current;
      const targetY = container.offsetTop + container.offsetHeight - el.clientHeight + 24;

      pinnedTopRef.current = null;
      if (spacerRef.current) spacerRef.current.style.height = '0px';

      el.scrollTop = Math.max(0, targetY);
      isInitialLoadDone.current = true;
      prevMessageCount.current = messages.length;
      prevFirstMessageId.current = messages[0].id || null;
      prevLastMessageIdRef.current = messages[messages.length - 1].id || null;
      prevScrollInfo.current = { top: el.scrollTop, height: el.scrollHeight };
    }
  }, [messages, scrollRef]);

  // 2. PREPEND SCROLL ANCHORING MECHANIC (Fixes Infinite Scroll Loop)
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !isInitialLoadDone.current) return;

    const currentFirstMessageId = messages.length > 0 ? (messages[0].id || null) : null;

    if (
      prevFirstMessageId.current &&
      currentFirstMessageId &&
      prevFirstMessageId.current !== currentFirstMessageId &&
      messages.length > prevMessageCount.current
    ) {
      // We prepended older messages! Adjust scrollTop by the height difference.
      const heightDiff = el.scrollHeight - prevScrollInfo.current.height;
      el.scrollTop = prevScrollInfo.current.top + heightDiff;
    }

    prevFirstMessageId.current = currentFirstMessageId;
    prevScrollInfo.current = { top: el.scrollTop, height: el.scrollHeight };
  }, [messages, scrollRef]);

  // 3. 🚀 EXACT GEMINI UX: PIN PROMPT ONCE, NO AUTO-SCROLL DURING STREAMING
  // =====================================================================
  // AI_NOTE: ARCHITECTURE EXPLANATION (WHY IT WORKS THIS WAY - DO NOT TOUCH):
  // The user demands the exact "Gemini Physics", which consists of 3 laws:
  // 1. When you send a question, IT travels to the top of the screen ("pinned").
  // 2. The AI starts writing its response *below* the question.
  // 3. WHILE the AI writes, AUTO-SCROLL IS OFF. The screen is frozen.
  //    The question never moves from the ceiling. The AI text generates freely downwards,
  //    even going off-screen (reducing the size of the scrollbar thumb).
  // Therefore, this useEffect ONLY SCROLLS ONCE (when messages.length changes).
  // There is NO code chasing the `streamingText` variable on purpose.
  // =====================================================================
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isInitialLoadDone.current) return;

    if (messages.length > prevMessageCount.current) {
      const lastMsg = messages[messages.length - 1];
      const appended = !prevLastMessageIdRef.current || prevLastMessageIdRef.current !== lastMsg.id;

      if (appended && (lastMsg.sender === 'student' || lastMsg.status === 'thinking')) {
        requestAnimationFrame(() => {
          let targetIndex = -1;
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].sender === 'student') {
              targetIndex = i;
              break;
            }
          }

          if (targetIndex !== -1) {
            const targetMsg = messages[targetIndex];
            const targetId = targetMsg.id || targetIndex;
            const targetEl = document.getElementById(`message-${targetId}`);

            if (targetEl && el) {
              const scrollRect = el.getBoundingClientRect();
              const targetRect = targetEl.getBoundingClientRect();
              const absoluteTop = el.scrollTop + (targetRect.top - scrollRect.top);

              pinnedTopRef.current = absoluteTop;

              if (spacerRef.current && messagesContainerRef.current) {
                const computedStyle = window.getComputedStyle(el);
                const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
                const neededHeight = absoluteTop + el.clientHeight;
                const currentHeightWithoutSpacer = messagesContainerRef.current.offsetTop + messagesContainerRef.current.offsetHeight + paddingBottom;
                const exactSpacerHeight = Math.max(0, neededHeight - currentHeightWithoutSpacer);
                spacerRef.current.style.height = `${exactSpacerHeight}px`;
              }

              // FORCE REFLOW: Force Chrome to calculate the newly injected spacer height synchronously.
              // If we don't do this, Chrome uses the old cached scrollHeight and aborts the scroll.
              void el.scrollHeight;

              // Move the question upwards (Gemini step 1)
              smoothScrollTo(el, Math.max(0, absoluteTop - 24), 400);
            }
          }
        });
      }
    }

    prevMessageCount.current = messages.length;
    if (messages.length > 0) {
      prevLastMessageIdRef.current = messages[messages.length - 1].id || null;
    }
  }, [messages, scrollRef]);

  // SMART SPACER: OBSERVE HEIGHT CHANGES IN REAL TIME
  useEffect(() => {
    if (!messagesContainerRef.current || !scrollRef.current || !spacerRef.current) return;

    // Cache the padding to avoid layout thrashing
    const computedStyle = window.getComputedStyle(scrollRef.current);
    const cachedPaddingBottom = parseFloat(computedStyle.paddingBottom) || 0;

    resizeObserverRef.current = new ResizeObserver(() => {
      if (pinnedTopRef.current !== null) {
        const el = scrollRef.current!;
        const container = messagesContainerRef.current!;

        const neededHeight = pinnedTopRef.current + el.clientHeight;
        const currentHeightWithoutSpacer = container.offsetTop + container.offsetHeight + cachedPaddingBottom;

        const exactSpacerHeight = Math.max(0, neededHeight - currentHeightWithoutSpacer);
        spacerRef.current!.style.height = `${exactSpacerHeight}px`;


      }
    });

    resizeObserverRef.current.observe(messagesContainerRef.current);
    
    // AI_NOTE: 🛑 CRITICAL ANDROID FIX (DO NOT TOUCH) 🛑
    // We MUST observe scrollRef.current (the physical window). When the Android virtual keyboard closes, 
    // the window stretches. If we don't observe this, the spacer stays tiny, and the pinned question falls 
    // to the middle of the screen because Chrome Android applies scroll clamping. 
    // THIS LINE KEEPS THE QUESTION PINNED PERFECTLY WHILE THE KEYBOARD VANISHES.
    resizeObserverRef.current.observe(scrollRef.current);

    return () => resizeObserverRef.current?.disconnect();
  }, [scrollRef]);

  // 4. SMART SCROLL LOCK (Memoized with Refs to prevent recreation)
  const paginationStateRef = useRef({ hasMore, isFetchingOlder, onLoadOlder });
  useLayoutEffect(() => {
    paginationStateRef.current = { hasMore, isFetchingOlder, onLoadOlder };
  });

  const isScrollTicking = useRef(false);

  const handleScroll = useCallback(() => {
    if (isScrollTicking.current) return;
    
    isScrollTicking.current = true;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      const container = messagesContainerRef.current;
      if (!el || !container) {
        isScrollTicking.current = false;
        return;
      }

      // Exact distance from the bottom of the MESSAGES (ignoring parent's padding-bottom)
      const contentBottom = container.offsetTop + container.offsetHeight;
      const scrollBottom = el.scrollTop + el.clientHeight;
      const distanceFromContentBottom = contentBottom - scrollBottom;

      if (distanceFromContentBottom > 100) {
        shouldAutoScrollRef.current = false;
        setShowScrollButton(true);
      } else {
        shouldAutoScrollRef.current = true;
        setShowScrollButton(false);
      }

      const { hasMore: currentHasMore, isFetchingOlder: currentIsFetchingOlder, onLoadOlder: currentOnLoadOlder } = paginationStateRef.current;

      // Upward pagination (older messages)
      if (el.scrollTop < 50 && currentHasMore && !currentIsFetchingOlder && currentOnLoadOlder && isInitialLoadDone.current) {
        currentOnLoadOlder();
      }

      prevScrollInfo.current = { top: el.scrollTop, height: el.scrollHeight };
      
      isScrollTicking.current = false;
    });
  }, [scrollRef, shouldAutoScrollRef]);

  // 5. Scroll to bottom math (for the button)
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current && messagesContainerRef.current) {
      shouldAutoScrollRef.current = true;
      setShowScrollButton(false);
      pinnedTopRef.current = null;
      if (spacerRef.current) spacerRef.current.style.height = '0px';

      // Scroll to the bottom of the *messages*, not the bottom of the padding
      // AI_NOTE: We add + 260 here so it scrolls past the V0 gradient and the taller composer.
      const el = scrollRef.current;
      const container = messagesContainerRef.current;
      const targetY = container.offsetTop + container.offsetHeight - el.clientHeight + 260;
      smoothScrollTo(el, Math.max(0, targetY), 400);
    }
  }, [scrollRef, shouldAutoScrollRef]);

  return (
    <div className="flex-1 relative w-full flex flex-col overflow-hidden bg-transparent">
      <div
        className={`absolute bottom-[100px] md:bottom-[120px] left-1/2 -translate-x-1/2 z-overlay transition-all duration-300 transform ${showScrollButton ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 pointer-events-none'}`}
      >
        <button
          onClick={scrollToBottom}
          className="bg-card/95 border border-chat-scroll-border/60 shadow-[0_4px_16px_rgba(0,0,0,0.1)] text-chat-icon-normal hover:text-chat-composer-text rounded-full p-2.5 transition-colors flex items-center justify-center cursor-pointer"
          aria-label="Scroll to bottom"
          type="button"
        >
          <ArrowDown className="w-5 h-5" />
        </button>
      </div>

      <div
        className="flex-1 relative w-full flex flex-col overflow-hidden bg-transparent"
      >
        {/* Fading gradient at the top (Top Veil) */}
        <div className="absolute top-0 left-0 w-full z-dropdown pointer-events-none">
          <div className="w-full h-8 md:h-12 bg-gradient-to-b from-background dark:from-background to-transparent" />
        </div>

        {/* MESSAGES SCROLL CONTAINER */}
        {/* ===================================================================== */}
        {/* AI_NOTE: SOLID ABYSS EXPLANATION (ORIGINAL GEMINI STYLE): */}
        {/* We replaced the old static pb-[70vh] (which left an infinite abyss) */}
        {/* with a normal pb-[140px] so the text isn't hidden by the composer. */}
        {/* The "travel to ceiling" is now achieved via the dynamic spacer below. */}
        {/* This guarantees short responses have a landing pad, while long ones */}
        {/* do not have extra padding, killing the infinite scroll bug. */}
        {/* ACCESSIBILITY WARNING: Hidden tables (like sr-only accessibility tables) */}
        {/* can alter bounding rect heights and break this abyss math. Be careful! */}
        {/* ===================================================================== */}
        <div ref={scrollRef} className="flex flex-col w-full h-full overflow-y-auto pb-[220px] md:pb-[260px] relative [overflow-anchor:none] [overscroll-behavior:contain]" onScroll={handleScroll}>
          <div className="max-w-[800px] mx-auto w-full flex flex-col pb-2 px-2 md:px-4" ref={messagesContainerRef}>
            {messages.length === 0 && !isFetchingOlder && (
              <SuggestedPrompts onSelect={onSuggestedPrompt} />
            )}

            {isFetchingOlder && (
              <div className="flex justify-center py-4">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-chat-spinner rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-2 h-2 bg-chat-spinner rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-2 h-2 bg-chat-spinner rounded-full animate-bounce"></div>
                </div>
              </div>
            )}

            {(() => {
              const lastStudentIndex = messages.map(m => m.sender).lastIndexOf('student');
              return messages.map((msg, index) => {
              const msgId = msg.id || index;
              const isLastMessage = index === messages.length - 1 && !isPending && !streamingText;
              const isLastStudent = msg.sender === 'student' && index === lastStudentIndex;
              return (
                <div key={msgId} id={`message-${msgId}`} className="w-full flex justify-center">
                  <MessageBubble
                    message={msg}
                    onRetry={onRetry}
                    onSwitchToPro={onSwitchToPro}
                    onRemoveAttachment={onRemoveAttachment}
                    isLastStudent={isLastStudent}
                    isLastMessage={isLastMessage}
                  />
                </div>
              );
            });
            })()}

            {/* AI_NOTE: EXPERT MITIGATION (DECOUPLED STREAMING BUBBLE)
                This active bubble exists independently from the static array above.
                This prevents React.memo from breaking during SSE streaming. */}
            {(isPending || streamingText) && (
              <div key="active-stream" id="message-active-stream" className="w-full flex justify-center">
                <MessageBubble
                  message={{
                    id: 'active-stream',
                    sender: 'assistant',
                    content: streamingText || '',
                    status: streamingText ? 'streaming' : 'thinking',
                    timestamp: new Date().toISOString()
                  } as ChatMessage}
                  onRetry={onRetry}
                  onSwitchToPro={onSwitchToPro}
                  isLastStudent={false}
                  isLastMessage={true}
                />
              </div>
            )}

          </div>
          {/* 
            AI_NOTE: EXACT SMART SPACER (DYNAMIC LANDING PAD)
            Isolated outside of messagesContainerRef. It is mathematically calculated to 
            allow the "travel to ceiling", and it shrinks in real-time with ResizeObserver.
            DO NOT REMOVE THIS OR THE PINNED QUESTION BEHAVIOR WILL BREAK.
          */}
          <div ref={spacerRef} className="w-full shrink-0" style={{ height: '0px' }} />
        </div>

        {/* FLOATING COMPOSER: Completely isolated from the scroll */}
        <div 
          className="absolute bottom-0 left-0 w-full z-header flex flex-col pointer-events-none transition-transform duration-300 ease-out justify-end"
          style={{ transform: 'translateY(0px)' }}
        >
          {/* 
            AI_NOTE: THE VEIL (Fading Out to the Android Bar)
            This gradient acts as a fog at the bottom of the screen. As messages scroll down 
            behind the floating composer, they get progressively faded into the background color.
            By the time they reach the Android OS Navigation Bar (at the very bottom), they are 
            100% invisible because the gradient is solid `bg-background` at the bottom.
          */}
          <div className="absolute bottom-0 left-0 w-full h-[180px] pointer-events-none bg-gradient-to-t from-background via-background/80 to-transparent z-0" />

          {/* 
            AI_NOTE: ANDROID NAVIGATION BAR FIX (DO NOT TOUCH)
            The padding-bottom MUST use `env(safe-area-inset-bottom)`.
            If you use a hardcoded padding (like `pb-2`), the Android/iOS system navigation 
            bar (the gesture pill) will overlap and hide the composer's bottom inputs.
            This dynamically pads the exact height of the OS navigation bar.
          */}
          <div className="w-full bg-transparent pointer-events-none pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:pb-[calc(2rem+env(safe-area-inset-bottom))] flex flex-col shrink-0 relative z-10">
            {composerNode}
          </div>
        </div>
      </div>
    </div>
  );
});


const ChatComposer = React.memo<{
  courseId: string;
  usePro: boolean;
  onUseProChange: (val: boolean) => void;
  onSend: (text: string, attachments: UploadedAttachment[]) => void;
  onStop?: () => void;
  isSending: boolean;
  tierLimits?: TierLimits | null;
  onClearContext?: () => void;
  setShowClearModal?: (show: boolean) => void;
}>(({
  courseId,
  usePro,
  onUseProChange,
  onSend,
  onStop,
  isSending,
  tierLimits: tierLimitsProp,
  onClearContext,
  setShowClearModal,
}) => {
    const { t } = useTranslation();
    const [inputText, setInputText] = useState('');
    const [composerError, setComposerError] = useState<string | null>(null);
    const errorTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => {
      return () => {
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      };
    }, []);

    const showError = (msg: string) => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      setComposerError(msg);
      errorTimerRef.current = setTimeout(() => setComposerError(null), 5000);
    };

    const isOnline = useSystemStore(state => state.isOnline);

    const DEFAULT_TIER_LIMITS: TierLimits = {
      pro_mode_daily_message_limit: 0,
      max_file_upload_bytes: 5242880,
      chat_max_attachments_per_message: 2
    };
    const tierLimits = tierLimitsProp || DEFAULT_TIER_LIMITS;
    const isProDisabled = (tierLimits.pro_mode_daily_message_limit || 0) <= 0;

    const { pendingAttachments, isUploading, handleFileSelect, handleRemoveAttachment, consumeAndClear, addFiles } =
      useAttachmentsManager({
        courseId,
        maxAttachments: tierLimits.chat_max_attachments_per_message || 2,
        maxBytes: tierLimits.max_file_upload_bytes || 5242880,
        onError: showError,
      });

    const hiddenImageInputRef = useRef<HTMLInputElement>(null);

    // AI_NOTE: CAPACITOR NATIVE MENU BYPASS (UI UX DECISION)
    // We use a unified '+' DropdownMenu for attachments to save space (Gemini Style).
    // If we used `CameraSource.Prompt`, Capacitor would pop its own native "Camera or Gallery" 
    // menu AFTER the user clicked our custom web menu, resulting in a confusing "Menu inside a Menu".
    // To solve this, our web menu passes explicit commands ('CAMERA' or 'PHOTOS') to bypass 
    // the OS prompt and jump directly into the lens or gallery.
    const handleNativePhoto = async (sourceType: 'CAMERA' | 'PHOTOS') => {
      if (isUploading || !isOnline) return;

      if (IS_NATIVE) {
        try {
          const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
          const source = sourceType === 'CAMERA' ? CameraSource.Camera : CameraSource.Photos;
          const photo = await Camera.getPhoto({
            resultType: CameraResultType.Uri,
            source: source,
            quality: 90,
            allowEditing: false
          });

          if (photo.webPath) {
            const response = await fetch(photo.webPath);
            const blob = await response.blob();
            const file = new File([blob], `photo_${Date.now()}.${photo.format}`, { type: `image/${photo.format}` });
            await addFiles([file]);
          }
        } catch (error) {
          console.error("Camera error:", error);
          if (String(error).indexOf('User cancelled') === -1) {
            showError(`Failed to open ${sourceType.toLowerCase()}. Please check app permissions.`);
          }
        }
      } else {
        hiddenImageInputRef.current?.click();
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if ((!inputText.trim() && pendingAttachments.length === 0) || isSending || isUploading || !isOnline) return;
        const attachments = consumeAndClear();
        onSend(inputText, attachments);
        setInputText('');
      }
    };

    const handleSendClick = () => {
      if ((!inputText.trim() && pendingAttachments.length === 0) || isSending || isUploading || !isOnline) return;
      const attachments = consumeAndClear();
      onSend(inputText, attachments);
      setInputText('');
    };

    return (
      <div className={`relative w-full transition-opacity duration-300 pointer-events-auto ${!isOnline ? 'opacity-60 pointer-events-none' : ''}`}>
        {/* AI_NOTE: Composer grid perfectly matched to MessageBubble padding and max-w-3xl for flawless alignment with the text */}
        <div className="mx-auto w-full max-w-3xl px-2 sm:px-4 lg:px-8 relative z-10 flex flex-col">
          <div className="flex flex-col w-full px-4 md:px-6">
            {composerError && (
              <div className="bg-chat-error-bg text-chat-error text-sm px-3 py-2 rounded-md animate-pulse font-medium border border-chat-error">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {composerError}
              </div>
            )}


            {pendingAttachments.length > 0 && (
              <div className="flex space-x-2 px-2 py-1 mb-1 overflow-x-auto">
                {pendingAttachments.map((att: UploadedAttachment) => (
                  <div key={att.id} className="relative group shrink-0">
                    <div className="w-14 h-14 rounded-md border border-chat-border overflow-hidden bg-chat-composer-bg flex items-center justify-center">
                      {isUploading ? (
                        <div className="animate-pulse bg-chat-icon-muted w-full h-full"></div>
                      ) : att.mime_type.startsWith('image/') ? (
                        <img src={att.local_url} alt="attachment" className="object-cover w-full h-full" />
                      ) : (
                        <div className="flex flex-col items-center justify-center w-full h-full bg-chat-attachment-bg text-chat-retry-text">
                          <FileText className="w-5 h-5" />
                          <span className="text-[10px] font-bold mt-0.5 uppercase max-w-[90%] truncate text-center leading-none">{att.mime_type.split('/').pop() || 'DOC'}</span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveAttachment(att.id)}
                      className="absolute -top-1.5 -right-1.5 bg-chat-error hover:opacity-80 shadow-sm text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                      title="Remove image"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 
              AI_NOTE: STABLE COMPOSER LAYOUT (APPLE / WHATSAPP STYLE)
              We use a single `flex-row items-end` container layout for maximum stability.
              In Google Gemini (Native Android app), the layout uses LayoutTransitions to smoothly 
              morph from a 1-line layout into a 2-line layout (expanding the Textarea to w-full 
              and moving buttons down) when the user types long text. 
              
              However, in standard Web HTML/CSS (Tailwind), changing `flex-wrap` or `flex-basis` 
              instantly triggers a harsh 0ms layout recalculation ("brinco feo"), jarring the UX.
              Therefore, we MUST NOT dynamically toggle flex-wrap based on text length. 
              Instead, we lock the layout to this stable configuration where the Textarea 
              grows purely vertically in the center, and the side buttons stay comfortably 
              anchored to the floor (`items-end`). This prevents any visual jitter during rapid typing.
              
              The `min-h-[56px]` and `py-2.5` make the composer slightly taller/thicker.
            */}
            <div className="flex items-end gap-2 rounded-[32px] border border-chat-border bg-chat-composer-bg px-3 py-2.5 shadow-sm transition-[box-shadow,border-color] focus-within:ring-1 focus-within:ring-chat-composer-ring min-h-[56px]">

              <div className="flex items-center shrink-0 mb-0.5">
                <input ref={hiddenImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} tabIndex={-1} />
                {/* MOBILE ONLY: + Unified Menu */}
                <div className="md:hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      disabled={isUploading || !isOnline}
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors shrink-0 outline-none ${isUploading || !isOnline ? 'text-chat-icon-muted opacity-50 cursor-not-allowed' : 'text-chat-icon-normal hover:text-chat-composer-text hover:bg-chat-icon-hover-bg bg-chat-gray-bg hover:bg-chat-gray-hover shadow-sm'}`}
                      title="Add Attachment"
                    >
                      {isUploading ? <Loader2 className="animate-spin w-5 h-5 text-chat-spinner" /> : <Plus className="w-5 h-5" strokeWidth={2.5} />}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-48 rounded-2xl shadow-xl border-chat-border p-2 z-dropdown mb-2" side="top" align="start" sideOffset={12}>
                      <DropdownMenuItem onSelect={() => handleNativePhoto('CAMERA')} className="px-3 py-2.5 rounded-xl focus:bg-chat-composer-bg cursor-pointer flex items-center gap-3 outline-none">
                        <CameraIcon className="w-4 h-4 text-chat-composer-text" />
                        <span className="font-medium text-[15px] text-chat-composer-text">{t('chat.composer.camera')}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleNativePhoto('PHOTOS')} className="px-3 py-2.5 rounded-xl focus:bg-chat-composer-bg cursor-pointer flex items-center gap-3 outline-none">
                        <ImageIcon className="w-4 h-4 text-chat-composer-text" />
                        <span className="font-medium text-[15px] text-chat-composer-text">{t('chat.composer.photoLibrary')}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => {
                          const fileInput = document.createElement('input');
                          fileInput.type = 'file';
                          fileInput.accept = 'application/pdf,text/plain,text/csv,.docx,.pptx,.py,.r,.m,.txt';
                          fileInput.multiple = true;
                          fileInput.onchange = (e) => handleFileSelect(e as unknown as React.ChangeEvent<HTMLInputElement>);
                          fileInput.click();
                        }} className="px-3 py-2.5 rounded-xl focus:bg-chat-composer-bg cursor-pointer flex items-center gap-3 outline-none">
                        <Paperclip className="w-4 h-4 text-chat-composer-text" />
                        <span className="font-medium text-[15px] text-chat-composer-text">{t('chat.composer.document')}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* MOBILE ONLY: Clear AI Memory button */}
                {onClearContext && (
                  <div className="md:hidden">
                    <button
                      type="button"
                      onClick={() => setShowClearModal?.(true)}
                      disabled={isSending || !isOnline}
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors shrink-0 outline-none ${isSending || !isOnline ? 'text-chat-icon-muted opacity-50 cursor-not-allowed' : 'text-chat-icon-normal hover:text-chat-composer-text hover:bg-chat-icon-hover-bg'}`}
                      title="Clear AI Memory"
                    >
                      <Eraser className="w-[18px] h-[18px]" strokeWidth={2} />
                    </button>
                  </div>
                )}

                {/* DESKTOP ONLY: Original split buttons */}
                <div className="hidden md:flex items-center shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (IS_NATIVE) {
                        handleNativePhoto('CAMERA');
                      } else {
                        hiddenImageInputRef.current?.click();
                      }
                    }}
                    disabled={isUploading || !isOnline}
                    className={`p-1.5 rounded-full transition-colors cursor-pointer shrink-0 ${isUploading || !isOnline ? 'text-chat-icon-muted opacity-50 cursor-not-allowed' : 'text-chat-icon-normal hover:text-chat-composer-text hover:bg-chat-icon-hover-bg'}`}
                    title="Take Photo or Library"
                  >
                    <CameraIcon className="w-5 h-5" strokeWidth={2} />
                  </button>

                  <label className={`p-1.5 rounded-full transition-colors cursor-pointer shrink-0 ${isUploading || !isOnline ? 'text-chat-icon-muted opacity-50 cursor-not-allowed' : 'text-chat-icon-normal hover:text-chat-composer-text hover:bg-chat-icon-hover-bg'}`} title="Attach Document">
                    <input type="file" accept="application/pdf,text/plain,text/csv,.docx,.pptx,.py,.r,.m,.txt" multiple className="hidden" disabled={isUploading || !isOnline} onChange={handleFileSelect} />
                    {isUploading ? (
                      <Loader2 className="animate-spin w-5 h-5 text-chat-spinner" />
                    ) : (
                      <Paperclip className="w-5 h-5" strokeWidth={2} />
                    )}
                  </label>

                  {/* DESKTOP: Clear AI Memory button */}
                  {onClearContext && (
                    <button
                      type="button"
                      onClick={() => setShowClearModal?.(true)}
                      disabled={isSending || !isOnline}
                      className={`p-1.5 rounded-full transition-colors cursor-pointer shrink-0 ${isSending || !isOnline ? 'text-chat-icon-muted opacity-50 cursor-not-allowed' : 'text-chat-icon-normal hover:text-chat-composer-text hover:bg-chat-icon-hover-bg'}`}
                      title="Clear AI Memory"
                    >
                      <Eraser className="w-5 h-5" strokeWidth={2} />
                    </button>
                  )}
                </div>
              </div>

              {/*
            AI_NOTE: GHOST GRID AUTO-GROW (Android-Safe, Zero-JS)
            We use `display: grid` with `grid-template-areas` so the textarea and
            an invisible ghost <div> share the exact same grid cell. The ghost div
            mirrors the textarea value — CSS makes both elements the same height.
            This avoids any JS scrollHeight manipulation, which causes a
            VisualViewport resize loop on Android WebView (the keyboard appears,
            JS resizes the textarea, viewport recomputes, JS fires again → crash).
            The `whitespace-pre-wrap` on the ghost ensures newlines are respected.
            The trailing `\u00A0` (non-breaking space) prevents the grid from
            collapsing on the last empty line.
          */}
              <div
                className="flex-1 min-w-0 grid"
                style={{ gridTemplateAreas: '"composer"' }}
              >
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isOnline ? t('chat.placeholder', 'Ask a question...') : t('chat.offline', 'No internet connection...')}
                  disabled={!isOnline}
                  className="flex-1 bg-transparent text-[15px] sm:text-[16px] text-chat-composer-text placeholder-chat-composer-placeholder outline-none resize-none max-h-[150px] min-h-[24px] overflow-y-auto py-1 w-full"
                  style={{ gridArea: 'composer' }}
                  rows={1}
                />
                {/* Ghost div: invisible, same font/padding as textarea, drives grid height */}
                <div
                  aria-hidden="true"
                  className="invisible text-[15px] sm:text-[16px] py-1 whitespace-pre-wrap break-words pointer-events-none select-none max-h-[150px] overflow-hidden"
                  style={{ gridArea: 'composer' }}
                >
                  {inputText}&#160;
                </div>
              </div>

              {(() => {
                // AI_NOTE: REACT PORTAL MAGIC (STRICT RULE COMPLIANCE)
                // The Architect mandated that 'usePro' state MUST NOT pollute the global Zustand store 
                // just to render a UI button in the Mobile Header (Rule: Colocation over Separation).
                // Solution: We keep the state strictly localized here inside ChatEngine, but we teleport 
                // the DOM nodes up to the Header using ReactDOM.createPortal. The element 
                // #chat-header-portal-target exists in app-shell / mobile-chat-header.tsx.
                const portalTarget = document.getElementById('chat-header-portal-target');
                const createModelSelectorMenu = (isMobile: boolean) => (
                  <DropdownMenu>
                    <DropdownMenuTrigger disabled={isProDisabled || !isOnline} className={`flex items-center gap-1 rounded-full text-sm transition-all focus:outline-none shrink-0 ${isMobile ? 'px-2.5 py-1.5 font-medium border border-chat-border/50 shadow-sm text-chat-composer-text bg-card hover:bg-accent hover:text-accent-foreground' : 'px-2 py-1 text-chat-composer-text hover:bg-chat-icon-hover-bg'}`} title={isProDisabled ? 'Pro Model Locked' : 'Select Model'}>
                      {usePro ? 'Pro' : 'Flash'}
                      <ChevronDown className={`h-4 w-4 ${isMobile ? 'opacity-50' : ''}`} strokeWidth={isMobile ? 2 : 2.5} />
                    </DropdownMenuTrigger>
                    
                    <DropdownMenuContent className="w-[280px] rounded-2xl shadow-xl border-chat-border p-2 z-[9999] mt-2" side="bottom" align="end" sideOffset={8}>
                      <DropdownMenuItem onSelect={() => onUseProChange(false)} className="px-3 py-3 rounded-xl focus:bg-accent cursor-pointer flex items-start gap-3 w-full text-left outline-none transition-colors">
                        <div className="w-5 flex justify-center mt-0.5 shrink-0">
                          {!usePro && <Check className="w-4 h-4 text-foreground" strokeWidth={2} />}
                        </div>
                        <div>
                          <div className="font-medium text-[15px] text-foreground">{t('chat.model.flash')}</div>
                          <div className="text-[13px] text-muted-foreground mt-0.5">{t('chat.model.flashDesc')}</div>
                        </div>
                      </DropdownMenuItem>

                      <DropdownMenuItem onSelect={() => onUseProChange(true)} disabled={isProDisabled} className={`px-3 py-3 rounded-xl focus:bg-accent cursor-pointer flex items-start gap-3 w-full text-left outline-none transition-colors ${isProDisabled ? 'opacity-50' : ''}`}>
                        <div className="w-5 flex justify-center mt-0.5 shrink-0">
                          {usePro && <Check className="w-4 h-4 text-foreground" strokeWidth={2} />}
                        </div>
                        <div>
                          <div className="font-medium text-[15px] text-foreground">{t('chat.model.pro')}</div>
                          <div className="text-[13px] text-muted-foreground mt-0.5">{t('chat.model.proDesc')}</div>
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                );

                return (
                  <>
                    {portalTarget && <div className="md:hidden">{createPortal(createModelSelectorMenu(true), portalTarget)}</div>}
                    {/* DESKTOP ONLY: Original Inline Dropdown */}
                    <div className="hidden md:block shrink-0 mr-1 mb-1">
                      {createModelSelectorMenu(false)}
                    </div>
                  </>
                );
              })()}

              <div className="flex items-center shrink-0 md:ml-0 ml-1 mb-0.5">
                <button
                  onClick={isSending ? onStop : handleSendClick}
                  disabled={(!inputText.trim() && pendingAttachments.length === 0 && !isSending) || isUploading || !isOnline}
                  className={`flex h-[36px] w-[36px] items-center justify-center rounded-full shrink-0 transition-transform ${!isOnline || isUploading || (!inputText.trim() && pendingAttachments.length === 0 && !isSending)
                    ? 'bg-transparent text-chat-text-muted cursor-default'
                      : isSending
                      ? 'bg-chat-gray-bg text-chat-text-dark hover:bg-chat-gray-hover cursor-pointer active:scale-95'
                      : 'ripple-touch bg-chat-blue-bg text-chat-text-dark hover:bg-chat-blue-hover cursor-pointer shadow-sm active:scale-95 hover:scale-105'
                    }`}
                  title={isSending ? "Stop generating" : "Send message"}
                >
                  {isSending ? (
                    <svg className="w-[18px] h-[18px] shrink-0" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="5.5" y="5.5" width="13" height="13" rx="2" /></svg>
                  ) : (
                    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                  )}
                </button>
              </div>
            </div>

            <div className="text-center mt-1 pb-1 hidden sm:block">
              <span className="text-[10px] text-chat-icon-muted leading-tight">
                {t('chat.disclaimer', 'AI can make mistakes and does not determine final grades. Always verify with your professor.')}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  });

// ============================================================================
// 3. MAIN ORCHESTRATOR ENGINE (Exported)
// ============================================================================

export interface ChatEngineProps {
  courseId: string;
  tierLimits?: TierLimits | null;
}

export const ChatEngine: React.FC<ChatEngineProps> = ({ courseId, tierLimits }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [usePro, setUsePro] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef<boolean>(true);

  const { data: historyData, isLoading, isError, loadOlderMessages, hasMore, isFetchingOlder } = useChatHistory(courseId);

  const { mutate: clearContextMutate } = useClearContext(courseId);

  const handleClearContext = useCallback(() => {
    setShowClearModal(false);
    clearContextMutate();
  }, [clearContextMutate]);

  const {
    streamingText,
    isPending,
    handleSend,
    handleStop,
    handleRetry,
    handleSwitchToPro,
    handleRemoveAttachment
  } = useChatSession(courseId, historyData, usePro, setUsePro, scrollRef, shouldAutoScrollRef);

  // AI_NOTE: EXPERT MITIGATION (RAM Optimization)
  // We pass the raw reference from React Query so MessageList's React.memo actually works.
  // We DO NOT clone arrays in every streaming tick. Streaming state is passed separately.
  const renderMessages = historyData?.messages || [];

  // AI_NOTE: Memoize the composer node so we don't break MessageList's React.memo on every render.
  const composerNode = React.useMemo(() => (
    <ChatComposer
      courseId={courseId}
      usePro={usePro}
      onUseProChange={setUsePro}
      onSend={handleSend}
      onStop={handleStop}
      isSending={isPending}
      tierLimits={tierLimits}
      onClearContext={handleClearContext}
      setShowClearModal={setShowClearModal}
    />
  ), [courseId, usePro, handleSend, handleStop, isPending, tierLimits, handleClearContext, setShowClearModal]);

  return (
    <>
    <AlertDialog open={showClearModal} onOpenChange={setShowClearModal}>
      <AlertDialogContent className="w-[90vw] max-w-md rounded-2xl md:rounded-3xl p-6 md:p-8 bg-card border-none shadow-2xl">
        <AlertDialogHeader className="space-y-4">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            <Eraser className="w-6 h-6 text-primary" strokeWidth={2} />
          </div>
          <AlertDialogTitle className="text-xl md:text-2xl text-center font-bold text-foreground">
            {t('chat.clearContextConfirmTitle', 'Clear AI Memory?')}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-sm md:text-base text-muted-foreground leading-relaxed">
            {t('chat.clearContextConfirm', "Are you sure you want to clear the AI's memory? This will hide your previous messages and start a fresh conversation.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-8 gap-3 sm:gap-4 flex-col sm:flex-row">
          <AlertDialogCancel className="mt-0 sm:mt-0 flex-1 rounded-xl h-12 text-[15px] font-semibold border-border hover:bg-accent hover:text-accent-foreground transition-colors">
            {t('common.cancel', 'Cancel')}
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleClearContext}
            className="flex-1 rounded-xl h-12 text-[15px] font-semibold bg-primary hover:bg-primary/90 text-primary-foreground transition-all shadow-md hover:shadow-lg active:scale-95"
          >
            {t('common.clear', 'Clear Context')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <div className="flex-1 overflow-hidden flex flex-col bg-transparent w-full">

      <div className="flex-1 overflow-hidden flex flex-col relative w-full">
        {isLoading && (!historyData?.messages || historyData.messages.length === 0) ? (
          <ChatSkeleton />
        ) : isError ? (
          <div className="flex-1 overflow-y-auto">
            <OfflineFallback onRetry={() => queryClient.invalidateQueries({ queryKey: ['chat', courseId] })} />
          </div>
        ) : (
          <MessageList
            messages={renderMessages}
            scrollRef={scrollRef}
            shouldAutoScrollRef={shouldAutoScrollRef}
            onRetry={handleRetry}
            onSwitchToPro={handleSwitchToPro}
            onRemoveAttachment={handleRemoveAttachment}
            onLoadOlder={loadOlderMessages}
            hasMore={hasMore}
            isFetchingOlder={isFetchingOlder}
            composerNode={composerNode}
            isPending={isPending}
            streamingText={streamingText}
            onSuggestedPrompt={(text) => handleSend(text, [])}
          />
        )}
      </div>
    </div>
    </>
  );
};
