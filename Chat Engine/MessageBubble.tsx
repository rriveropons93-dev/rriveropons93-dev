/****************************************************************************************
 * 🛑🛑🛑 AI_NOTE: ARCHITECTURE LOCK - DO NOT TOUCH SCROLL LOGIC 🛑🛑🛑
 * 
 * WARNING TO ALL AI AGENTS (ANTIGRAVITY OR OTHERS) !!!
 * This file and ChatEngine.tsx have been destroyed and rebuilt multiple times by AIs 
 * who thought they could "improve" or "fix" the scroll by reverting to ChatGPT defaults.
 * DO NOT TOUCH THIS LOGIC. IT TOOK HUNDREDS OF HOURS TO PERFECT.
 * 
 * --- ABSOLUTE RULES OF THIS ARCHITECTURE (FOR AIs) ---
 * 1. NORMAL FLEX-COL: We use `flex-col`, NOT `flex-col-reverse`.
 * 2. TRAVEL TO CEILING: When a user sends a message, it mathematically calculates the 
 *    exact offset to move the question to the VERY TOP of the screen and PINS it there.
 *    DO NOT use standard `scrollIntoView` for this.
 * 3. DYNAMIC SMART SPACER & RESIZE OBSERVER (In ChatEngine): A spacer exists at the 
 *    bottom. As the AI types and the text grows, a ResizeObserver SHRINKS the spacer 
 *    in real-time to absorb the growth. This keeps the total scrollHeight constant and 
 *    keeps the question permanently pinned at the top ceiling.
 * 4. PREPEND SCROLL ANCHORING: When loading older messages upwards, we calculate the 
 *    scrollHeight difference and adjust scrollTop. Touching this causes infinite loops.
 * 5. OVERFLOW ANCHOR: DO NOT alter `overflowAnchor: 'none'` on the bubble styles.
 * 6. ACCESSIBILITY TABLES ISSUE: Be warned that hidden accessibility tables (like `<table className="sr-only">` 
 *    in ChartRenderer) can silently alter the bounding box heights and break the ResizeObserver math. 
 *    Any future accessibility work must account for height changes.
 * 7. AI_NOTE: [DESIGN DECISION] Hardcoded design values (px, min-w, max-w, rounded-[]) exist intentionally throughout this file.
 *    DO NOT CHANGE THEM to Tailwind tokens. The chat module is visually isolated on purpose to prevent global theme changes from breaking its layout.
 * 
 * 🛑 IF YOU BREAK THIS, YOU DESTROY HOURS OF HUMAN WORK. DO NOT FALL BACK TO DEFAULT AI LOGIC.
 ****************************************************************************************/
import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import type { PluggableList } from 'unified';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';

import type { ChatMessage, Attachment } from '../ChatDomain';
import { SecureAttachment } from './SecureAttachment';
/* eslint-disable react-hooks/refs */
import { chatRepository } from '../../../repositories/ChatRepository';
import { downloadFile } from '../../../lib/utils/downloadFile';
import { copyToClipboard } from '../../../lib/utils/copyToClipboard';
import { jsonrepair } from 'jsonrepair';
import { Download, Copy, AlertTriangle, ChevronDown, MonitorPlay, Loader2, X, ThumbsUp, ThumbsDown, Check, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHaptics } from '../../../lib/platform/useHaptics';
import { toast } from 'sonner';

type MarkdownProps = React.HTMLAttributes<HTMLElement> & {
  node?: unknown;
  inline?: boolean;
  ref?: React.Ref<HTMLElement>;
};

const cleanProps = ({ node: _node, inline: _inline, ref: _ref, ...rest }: MarkdownProps) => rest;

const LazyChartRenderer = React.lazy(() => import('./charts/ChartRenderer').then(m => ({ default: m.ChartRenderer })));
const LazyMermaidRenderer = React.lazy(() => import('./charts/MermaidRenderer').then(m => ({ default: m.MermaidRenderer })));
const LazyProCodeBlock = React.lazy(() => import('./ProCodeBlock').then(m => ({ default: m.ProCodeBlock })));

// AI_NOTE: KaTeX CSS (~300KB) is loaded once at module-level instead of per-MessageBubble mount.
// Previously, each bubble ran import('katex/dist/katex.min.css') in a useEffect, creating
// 50+ redundant Promises in long chats. The browser deduplicates the network request but
// the Promise/microtask overhead is pure waste. Module-level execution runs exactly once.
import('katex/dist/katex.min.css').catch(() => {});

const MemoizedChartOrCodeBlock = React.memo(({ content, language, isChartFallback }: { content: string, language: string, isChartFallback: boolean }) => {
  const { t } = useTranslation();
  const chartFallbackNode = <div className="h-56 sm:h-64 w-full my-5 bg-muted rounded-2xl border border-border flex items-center justify-center"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-chat-spinner"></div></div>;

  const parsedChart = React.useMemo(() => {
    if (!isChartFallback && language !== 'chart') return null;
    try {
      const repaired = jsonrepair(content.trim());
      const parsed = JSON.parse(repaired);
      if (language === 'chart') return parsed;
      const CHART_TYPES = ['multiline', 'bar', 'line', 'area', 'pie', 'scatter', 'function', 'flowchart', 'mindmap'];
      if (parsed && typeof parsed.type === 'string' && CHART_TYPES.includes(parsed.type)) {
        return parsed;
      }
    } catch {
      // intentionally swallow
    }
    return null;
  }, [content, language, isChartFallback]);

  if (language === 'chart') {
    if (!parsedChart) {
      return <div className="my-4 p-4 bg-muted text-muted-foreground rounded-xl border border-border text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {t('chat.chartCorrupted')}</div>; 
    }
    if (parsedChart.type === 'flowchart' || parsedChart.type === 'mindmap') {
      return <React.Suspense fallback={chartFallbackNode}><LazyMermaidRenderer chartCode={JSON.stringify(parsedChart)} /></React.Suspense>;
    }
    return <React.Suspense fallback={chartFallbackNode}><LazyChartRenderer config={parsedChart} /></React.Suspense>;
  }

  if (isChartFallback && parsedChart) {
    if (parsedChart.type === 'flowchart' || parsedChart.type === 'mindmap') {
      return <React.Suspense fallback={chartFallbackNode}><LazyMermaidRenderer chartCode={JSON.stringify(parsedChart)} /></React.Suspense>;
    }
    return <React.Suspense fallback={chartFallbackNode}><LazyChartRenderer config={parsedChart} /></React.Suspense>; 
  }

  return <React.Suspense fallback={<div className="my-4 p-4 bg-muted rounded-xl flex justify-center"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-chat-spinner"></div></div>}><LazyProCodeBlock language={language}>{content.replace(/\n$/, '')}</LazyProCodeBlock></React.Suspense>;
});

// AI_NOTE: Prop Identity Leak Fix (Do NOT move inside MessageBubble)
// These arrays must be statically declared at the module level.
// If declared inline inside <ReactMarkdown>, they are recreated on every keystroke,
// which causes react-markdown to destroy its AST cache and completely remount the DOM.
const REMARK_PLUGINS: PluggableList = [remarkMath, remarkGfm];
const REHYPE_PLUGINS: PluggableList = [rehypeRaw, [rehypeKatex, { strict: false, trust: false, throwOnError: false }]];

const MarkdownComponents = {
  p: (props: MarkdownProps) => <p className="mt-0 mb-4 last:mb-0" {...cleanProps(props)} />,
  a: (props: MarkdownProps) => <a className="text-chat-link hover:underline" target="_blank" rel="noopener noreferrer" {...cleanProps(props)} />,
  ul: (props: MarkdownProps) => <ul className="list-disc pl-4 mb-2" {...cleanProps(props)} />,
  ol: (props: MarkdownProps) => <ol className="list-decimal pl-4 mb-2" {...cleanProps(props)} />,
  li: (props: MarkdownProps) => <li className="mb-1" {...cleanProps(props)} />,
  table: (props: MarkdownProps) => <div className="overflow-x-auto my-4 rounded-xl border border-border shadow-sm"><table className="w-full text-sm text-left border-collapse" {...cleanProps(props)} /></div>,
  thead: (props: MarkdownProps) => <thead className="bg-muted text-muted-foreground uppercase text-xs" {...cleanProps(props)} />,
  tbody: (props: MarkdownProps) => <tbody className="bg-chat-table-bg" {...cleanProps(props)} />,
  tr: (props: MarkdownProps) => <tr className="border-b border-border hover:bg-muted/50 transition-colors" {...cleanProps(props)} />,
  th: (props: MarkdownProps) => <th className="px-4 py-3 font-semibold border-r last:border-r-0 border-border" {...cleanProps(props)} />,
  td: (props: MarkdownProps) => <td className="px-4 py-3 border-r last:border-r-0 border-border align-top" {...cleanProps(props)} />,
  hr: (props: MarkdownProps) => <hr className="my-5 border-t border-border/60" {...cleanProps(props)} />,
  cite: (props: MarkdownProps) => <cite className="inline-flex items-center px-2 py-0.5 rounded text-[0.7rem] font-bold bg-primary/20 text-primary border border-indigo-200 mx-1 not-italic shadow-sm select-none" title="Source Document" {...cleanProps(props)} />,
  code: (props: MarkdownProps) => {
    const { inline, className, children } = props;
    const match = /language-(\w+)/.exec(String(className || ''));
    const isBlock = String(className || '').includes('language-') || String(children).includes('\n');
    
    if (!inline && match && match[1] === 'mermaid') { 
      return <React.Suspense fallback={<div className="h-48 w-full my-5 bg-muted rounded-2xl border border-border flex items-center justify-center"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-chat-spinner"></div></div>}><LazyMermaidRenderer chartCode={String(children)} /></React.Suspense>; 
    }

    if (isBlock && !inline) {
       const isChartFallback = (!match || match[1] === 'json');
       return <MemoizedChartOrCodeBlock content={String(children)} language={match?.[1] || ''} isChartFallback={isChartFallback} />;
    }

    return <code className="bg-primary/10 text-primary border border-primary/20 rounded px-1.5 py-0.5 text-[0.95em] font-mono shadow-sm" {...cleanProps(props)}>{children}</code>;
  }
};

const defaultTags = ['div', 'span', 'strong', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'br', 'img', 'del', 'input', 'math', 'maction', 'maligngroup', 'malignmark', 'menclose', 'merror', 'mfenced', 'mfrac', 'mi', 'mlongdiv', 'mmultiscripts', 'mn', 'mo', 'mover', 'mpadded', 'mphantom', 'mroot', 'mrow', 'ms', 'mscarries', 'mscarry', 'msgroup', 'msline', 'mspace', 'msqrt', 'msrow', 'mstack', 'mstyle', 'msub', 'msup', 'msubsup', 'mtable', 'mtd', 'mtext', 'mtr', 'munder', 'munderover', 'semantics', 'annotation', 'annotation-xml', 'svg', 'g', 'path', 'rect', 'circle', 'line', 'polyline', 'polygon'];

// Use a factory function to prevent capturing the module's entire lexical environment in 60 loop closures
function createDefaultComponent(tag: string) {
  return function DefaultMarkdownComponent(props: MarkdownProps) {
    return React.createElement(tag, cleanProps(props));
  };
}

defaultTags.forEach(tag => {
  if (!(MarkdownComponents as Record<string, unknown>)[tag]) {
    (MarkdownComponents as Record<string, React.ElementType>)[tag] = createDefaultComponent(tag);
  }
});

interface MessageBubbleProps {
  message: ChatMessage;
  onRetry?: (messageText: string, messageId: string, attachments?: Attachment[]) => void;
  onSwitchToPro?: () => void;
  onRemoveAttachment?: (messageId: string, index: number) => void;
  isLastStudent?: boolean;
  isLastMessage?: boolean;
}

const THINKING_PHRASES = ["Understanding Context...", "Searching Knowledge Base...", "Formulating answer..."];

const AnimatedThinking: React.FC = () => {
  const [stamp, setStamp] = useState(0);

  useEffect(() => {
    let iterations = 0;
    const timer = setInterval(() => {
      iterations++;
      // Circuit breaker: kill the interval after ~2 minutes to prevent zombie memory leaks
      // if a message gets permanently stuck in 'thinking' status due to a crash.
      if (iterations > 60) {
        clearInterval(timer);
        return;
      }
      setStamp(t => (t + 1) % THINKING_PHRASES.length);
    }, 1800);
    return () => clearInterval(timer);
  }, []);

  return <span>{THINKING_PHRASES[stamp]}</span>;
};

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({ 
  message, 
  onRetry, 
  onSwitchToPro, 
  onRemoveAttachment 
}) => {
  const { t } = useTranslation();

  // AI_NOTE: KaTeX CSS is now loaded at module-level (line ~59) instead of per-bubble.
  // This eliminated 50× redundant Promise allocations in long chat sessions.

  const isStudent = message.sender === 'student';
  const isThinking = message.status === 'thinking';
  const isError = message.status === 'error';
  const { triggerHaptic } = useHaptics();

  const [exportingIndex, setExportingIndex] = useState<number | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<number | null>(message.feedback_score || null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setFeedback(message.feedback_score || null);
  }, [message.feedback_score]);

  React.useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  React.useEffect(() => {
    if (isError) {
      triggerHaptic('error');
    }
  }, [isError, triggerHaptic]);

  // Allow student messages to collapse even if they have an error (because they can be huge)
  const isCollapsible = isStudent && (message.content?.length || 0) > 300;

  const imageAttachments = React.useMemo(() => message.attachments?.filter(a => a.mime_type !== 'text/markdown') || [], [message.attachments]);
  const documentAttachments = React.useMemo(() => message.attachments?.filter(a => a.mime_type === 'text/markdown') || [], [message.attachments]);
  const activeContent = message.content;

  // AI_NOTE: EXPERT MITIGATION (Delta Parsing)
  // We avoid O(N^2) regex scans during streaming by only scanning the new incoming chunk.
  const parsedStateRef = React.useRef({ lastLen: 0, codeCount: 0, mathCount: 0 });

  const processedData = React.useMemo(() => {
    let content = activeContent || '';
    const isStreaming = message.status === 'streaming';
    
    if (isStreaming) {
      // 1. Safety Check: If the stream restarts or shrinks, reset the counters
      if (content.length < parsedStateRef.current.lastLen) {
        parsedStateRef.current = { lastLen: 0, codeCount: 0, mathCount: 0 };
      }

      // 2. Extract only the new characters (The Delta)
      const newText = content.slice(parsedStateRef.current.lastLen);
      
      // 3. Scan only the delta (O(K) where K is the chunk size, not the full string)
      if (newText.length > 0) {
        parsedStateRef.current.codeCount += (newText.match(/```/g) || []).length;
        parsedStateRef.current.mathCount += (newText.match(/\\$\\$/g) || []).length;
        parsedStateRef.current.lastLen = content.length;
      }

      const hasOpenCodeBlock = parsedStateRef.current.codeCount % 2 !== 0;
      const hasOpenBlockMath = parsedStateRef.current.mathCount % 2 !== 0;
      
      if (hasOpenCodeBlock) {
        content += '\n```';
      }
      if (hasOpenBlockMath) {
        content += '\n$$';
      }
      
      // lastIndexOf is already O(N) but scans backwards, extremely fast. No delta needed here.
      const chartMatch = content.lastIndexOf('```chart');
      const mermaidMatch = content.lastIndexOf('```mermaid');
      const lastIdx = Math.max(chartMatch, mermaidMatch);
      
      if (lastIdx !== -1 && hasOpenCodeBlock) {
         return { type: 'chart-loading' as const, content: content.substring(0, lastIdx) };
      }
    } else {
      parsedStateRef.current = { lastLen: 0, codeCount: 0, mathCount: 0 };
    }
    
    return { type: 'markdown' as const, content };
  }, [activeContent, message.status]);

  if (!activeContent?.trim() && imageAttachments.length === 0 && documentAttachments.length === 0 && !isThinking) {
    return null;
  }

  const renderedImages = imageAttachments.length > 0 ? (
    <div className={`flex flex-wrap gap-2 ${isStudent ? 'mb-2 justify-end w-full' : 'mb-3'}`}>
      {imageAttachments.map((att: Attachment, idx: number) => (
        <div key={att.id || idx} className="relative group flex items-start" onClick={(e) => e.stopPropagation()}>
          <SecureAttachment
            relativeUrl={att.url || ''}
            localUrl={att.local_url}
            mimeType={att.mime_type}
            filename={att.file_name || 'Document'}
            className={`block w-24 h-24 sm:w-32 sm:h-32 overflow-hidden ${isStudent ? 'rounded-2xl' : 'rounded-xl'} transition-transform hover:scale-105 shadow-sm border border-border bg-chat-attachment-bg cursor-pointer object-cover`}
          />
          {isError && onRemoveAttachment && (
            <button
              type="button"
              title="Remove file"
              onClick={(e) => { e.stopPropagation(); onRemoveAttachment(message.id, idx); }}
              className="absolute -top-1 -right-1 bg-chat-error text-white rounded-full p-1 shadow z-10 hover:opacity-80 transition-opacity"
            >
              <X className="w-3 h-3" strokeWidth={2.5} />
            </button>
          )}
        </div>
      ))}
    </div>
  ) : null;

  const renderedDocs = documentAttachments.length > 0 ? (
    <div className={`flex flex-col gap-2 ${isStudent ? 'mb-2 items-end w-full' : 'mt-3'}`}>
      {exportError && !isStudent && (
        <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-lg text-xs font-medium border border-destructive/20 mb-2">
          {exportError}
        </div>
      )}
      {!isStudent && !activeContent?.trim() && (
        <p className="text-sm font-medium text-muted-foreground">{documentAttachments.length > 1 ? 'I have prepared your files:' : 'I have prepared your file on demand:'}</p>
      )}
      <div className={`flex flex-wrap gap-2 ${isStudent ? 'justify-end w-full' : ''}`}>
        {documentAttachments.map((docAtt, idx) => {
          const currentIsExporting = exportingIndex === idx;
          const filename = docAtt.file_name || 'document.pdf';
          const format = docAtt.export_format || 'pdf';

          return (
            <div
              key={docAtt.id || docAtt.url || idx}
              className={`flex items-center justify-between gap-4 rounded-2xl py-2.5 px-4 w-fit min-w-[220px] max-w-sm ${isStudent ? 'bg-chat-attachment-bg border border-chat-border shadow-sm' : 'bg-chat-bubble-bg dark:bg-chat-bubble-bg/50'}`}
            >
              <div className="flex flex-col overflow-hidden">
                <span className="text-chat-text-dark text-[14px] font-medium truncate mb-1">
                  {filename}
                </span>
                <div className="flex items-center gap-1.5">
                  <div className={`rounded-[3px] flex items-center justify-center w-[18px] h-[18px] flex-shrink-0 ${format.toLowerCase() === 'pdf' ? 'bg-chat-pdf-icon' : 'bg-chat-link'}`}>
                    <span className="text-white text-[8px] font-bold tracking-wide">
                      {format.toLowerCase() === 'pdf' ? 'PDF' : format.substring(0, 3).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-chat-text-muted text-[12px] font-normal uppercase">
                    {format}
                  </span>
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.preventDefault();
                  if (exportingIndex !== null || !docAtt.url) return;
                  setExportingIndex(idx);

                  chatRepository.exportDocument(format, filename, docAtt.url, message.id)
                    .then(blob => downloadFile(blob, filename).catch(e => console.error("Download failed:", e)))
                    .catch(e => {
                      console.error("Export failed:", e);
                      triggerHaptic('error');
                      setExportError("Error downloading the document. Please try again.");
                      setTimeout(() => setExportError(null), 4000);
                    })
                    .finally(() => setExportingIndex(null));
                }}
                className={`ml-auto flex-shrink-0 p-2 rounded-full transition-colors ${isStudent ? 'text-chat-text-muted hover:bg-chat-gray-bg' : 'text-chat-text-muted hover:text-chat-text-dark hover:bg-chat-gray-hover'}`}
              >
                {currentIsExporting ? (
                  <Loader2 className="animate-spin w-5 h-5" />
                ) : (
                  <Download className="w-5 h-5" strokeWidth={2} />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  ) : null;

  const content = (
    <div
      className={`flex w-full px-4 md:px-6 items-start ${isStudent ? 'justify-end mb-8' : 'justify-start mb-8'} group`}
      style={{ overflowAnchor: 'none', position: 'relative' }}
    >

      <div
        className={`flex flex-col gap-1 ${isStudent ? 'items-end w-full max-w-[85%] md:max-w-[70%]' : 'flex-1 min-w-0'} relative`}
      >


        {isStudent && renderedImages}
        {isStudent && renderedDocs}

        {(activeContent?.trim() || isThinking || !isStudent) && (
          <div
            onClick={() => {
              if (isCollapsible) {
                triggerHaptic('light');
                setIsExpanded(!isExpanded);
              }
            }}
            className={
              isStudent
                ? `w-fit px-5 py-[10px] bg-chat-bubble-bg text-chat-text-dark rounded-3xl break-words transition-all duration-300 ${isCollapsible ? 'cursor-pointer group' : ''} relative text-[16px] leading-relaxed`
                : "w-full bg-transparent text-foreground py-1 break-words relative"
            }
          >
            <div
              className={isCollapsible ? (!isExpanded ? "overflow-hidden" : "transition-all duration-500 ease-in-out") : ""}
              style={isCollapsible ? (!isExpanded ? {
                maxHeight: '96px',
                WebkitMaskImage: 'linear-gradient(to bottom, black 0px, black 60px, transparent 96px)',
                maskImage: 'linear-gradient(to bottom, black 0px, black 60px, transparent 96px)'
              } : { maxHeight: '5000px' }) : {}}
            >
              {!isStudent && renderedImages}

              {isThinking ? (
                <div className="flex space-x-2 items-center text-muted-foreground text-xs px-2 py-1 font-mono italic">
                  <Loader2 className="animate-spin w-4 h-4 text-muted-foreground/50" />
                  <AnimatedThinking />
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {activeContent && activeContent.trim() && (
                    <div className={isStudent ? "text-chat-text-dark text-[16px] leading-relaxed [&>p]:m-0 min-w-0" : `prose prose-slate max-w-none w-full min-w-0 overflow-x-auto text-[16px] leading-[1.75] antialiased text-chat-text-dark [&>*:first-child]:mt-0 [&_th]:bg-transparent [&_ol]:ml-4 [&_ul]:ml-4 ${message.status === 'streaming' ? 'streaming-message' : ''}`}>
                      {processedData.type === 'chart-loading' ? (
                        <>
                          <ReactMarkdown
                            remarkPlugins={REMARK_PLUGINS}
                            rehypePlugins={REHYPE_PLUGINS}
                            // AI_NOTE: Type Boundary Escape (Rule #4)
                            // This cast is required because MarkdownComponents is dynamically hydrated
                            // with SVG and KaTeX tags at runtime. TS cannot statically infer these keys.
                            components={MarkdownComponents as Record<string, React.ElementType>}
                          >
                            {processedData.content}
                          </ReactMarkdown>
                          <div className="my-4 p-4 rounded-xl border border-primary/20 bg-primary/10/50 flex flex-col items-center justify-center gap-3 animate-pulse">
                            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                              <MonitorPlay className="w-5 h-5" strokeWidth={2} />
                            </div>
                            <p className="text-sm font-medium text-primary">{t('chat.chartRendering')}</p>
                          </div>
                        </>
                      ) : (
                        <ReactMarkdown
                          remarkPlugins={REMARK_PLUGINS}
                          rehypePlugins={REHYPE_PLUGINS}
                          // AI_NOTE: Type Boundary Escape (Rule #4)
                          // This cast is required because MarkdownComponents is dynamically hydrated
                          // with SVG and KaTeX tags at runtime. TS cannot statically infer these keys.
                          components={MarkdownComponents as Record<string, React.ElementType>}
                        >
                          {processedData.content}
                        </ReactMarkdown>
                      )}
                    </div>
                  )}
                </div>
              )}

              {!isStudent && renderedDocs}
            </div>

            {isCollapsible && !isExpanded && (
              <div className="absolute bottom-2 right-2 w-[22px] h-[22px] bg-chat-bubble-bg rounded-full shadow-sm border border-border/50 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors cursor-pointer z-10" onClick={(e) => { e.stopPropagation(); triggerHaptic('light'); setIsExpanded(true); }}>
                <ChevronDown className="w-3.5 h-3.5" strokeWidth={2.5} />
              </div>
            )}
          </div>
        )}

        {/* Action Bar (Feedback & Copy) */}
        {!isStudent && !isThinking && message.status !== 'streaming' && !isError && (
          <div className="flex items-center gap-1 mt-2 text-muted-foreground opacity-50 hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={async () => { 
                const prev = feedback;
                setFeedback(1); 
                try {
                  await chatRepository.submitFeedback(message.id, 1);
                } catch (err) {
                  console.error(err);
                  setFeedback(prev);
                  toast.error("Failed to submit feedback.");
                }
              }}
              className={`p-1.5 rounded-full hover:bg-muted transition-colors ${feedback === 1 ? 'text-chat-link bg-chat-blue-hover/20' : ''}`}
              title="Good response"
            >
              <ThumbsUp className="w-[18px] h-[18px]" strokeWidth={1.5} />
            </button>
            <button
              onClick={async () => { 
                const prev = feedback;
                setFeedback(-1); 
                try {
                  await chatRepository.submitFeedback(message.id, -1);
                } catch (err) {
                  console.error(err);
                  setFeedback(prev);
                  toast.error("Failed to submit feedback.");
                }
              }}
              className={`p-1.5 rounded-full hover:bg-muted transition-colors ${feedback === -1 ? 'text-chat-error bg-chat-error-bg' : ''}`}
              title="Bad response"
            >
              <ThumbsDown className="w-[18px] h-[18px]" strokeWidth={1.5} />
            </button>
            <button
              onClick={async () => {
                const text = activeContent || '';
                const success = await copyToClipboard(text);
                if (success) {
                  triggerHaptic('success');
                  setCopied(true);
                  if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
                  copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
                }
              }}
              className="p-1.5 rounded-full hover:bg-muted transition-colors ml-1 relative"
              title="Copy"
            >
              {copied ? (
                <Check className="w-[18px] h-[18px] text-chat-success" strokeWidth={2} />
              ) : (
                <Copy className="w-[18px] h-[18px]" strokeWidth={1.5} />
              )}
            </button>
          </div>
        )}

        {/* Suggest Pro CTA */}
        {!isStudent && !isThinking && message.suggestPro && onSwitchToPro && (
          <button
            onClick={(e) => { e.stopPropagation(); onSwitchToPro(); }}
            className="mt-3 w-fit flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 hover:from-indigo-500/20 hover:to-purple-500/20 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-sm font-semibold rounded-xl transition-all shadow-sm group"
          >
            <span className="text-base group-hover:scale-110 transition-transform">✨</span>
            Try Pro for a deeper answer
          </button>
        )}

        {/* Error Bar (For failed messages) */}
        {isError && isStudent && onRetry && (
          <div className="flex flex-col items-end gap-1 mt-1">
            <button
              onClick={(e) => { e.stopPropagation(); triggerHaptic('medium'); onRetry(message.content, message.id, message.attachments); }}
              className="flex items-center gap-1 text-[11px] text-chat-retry-text hover:text-chat-retry-text-hover transition-colors font-medium px-1"
            >
              <RotateCcw className="w-3 h-3" strokeWidth={2.5} />
              Retry
            </button>
            {message.errorMessage && (
              <span className="text-[11px] text-chat-error font-medium px-1 text-right max-w-sm break-words">
                {message.errorMessage}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return content;
});

