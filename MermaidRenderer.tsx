import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from "react-i18next";
import { Code, AlertTriangle, Maximize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '../../../../components/ui/dialog';

interface MermaidRendererProps {
  chartCode: string;
  className?: string;
  containerClassName?: string;
}

// 🛡️ Error Boundary: If the mermaid code from Gemini is invalid, we catch it here
// so the rest of the chat doesn't crash.
// 
// AI_NOTE: UNTOUCHABLE SECURITY RULE (CSP unsafe-eval)
// Vercel's Content-Security-Policy (in vercel.json) MUST include 'unsafe-eval' 
// in the script-src directive. This is because Mermaid.js internally relies on 
// new Function() to calculate dynamic SVG sizes. If you remove 'unsafe-eval' 
// from vercel.json, this component will crash and charts will not render in production.
// Do NOT attempt to "harden" the CSP by removing it unless you are migrating 
// this component into a sandboxed iframe.
let isMermaidInitialized = false;

export const MermaidRenderer: React.FC<MermaidRendererProps> = ({ chartCode }) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const renderCounterRef = useRef<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [renderedSvgHtml, setRenderedSvgHtml] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    const currentRenderId = ++renderCounterRef.current;

    async function renderDiagram() {
      try {
        setErrorMsg(null);
        // 🚀 Lazy Load Mermaid exactly when needed (if not prefetched)
        const mermaid = (await import('mermaid')).default;
        
        // 🎨 Corporate Theme (Initialize exactly once globally to avoid race conditions)
        if (!isMermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: 'base',
            // AI_NOTE: 'loose' security level allows execution of HTML within Mermaid nodes.
            // This introduces a theoretical XSS vector if the AI generates malicious HTML.
            // However, it is required to render complex mathematical or formatting characters
            // properly. Do not change to 'strict' without confirming rendering works for all complex nodes.
            securityLevel: 'loose', // Relaxed to allow special characters in node text
            themeVariables: {
              primaryColor: 'var(--color-secondary)',
              primaryTextColor: 'var(--color-foreground)',
              primaryBorderColor: 'var(--color-primary)',
              lineColor: 'var(--color-muted-foreground)',
              secondaryColor: 'var(--color-muted)',
              tertiaryColor: 'var(--color-card)'
            }
          });
          isMermaidInitialized = true;
        }

        if (containerRef.current && isMounted) {
          // Explicitly clear the container to prevent Mermaid render collisions on re-renders
          containerRef.current.innerHTML = '';
          
          // AI_NOTE: Deterministic JSON to Mermaid Builder
          let finalMermaidCode = chartCode;
          try {
            const data = JSON.parse(chartCode);
            if (data.type === 'flowchart') {
              const dir = data.direction || 'TD';
              let code = `graph ${dir}\n`;
              if (data.nodes && Array.isArray(data.nodes)) {
                data.nodes.forEach((n: { id?: string | number, label?: string }) => {
                  const safeId = n.id ? String(n.id).replace(/[^A-Za-z0-9_]/g, '') : `node_${Math.random().toString(36).substring(2,7)}`;
                  const safeLabel = String(n.label || '').replace(/"/g, '\\"');
                  code += `  ${safeId}["${safeLabel}"]\n`;
                });
              }
              if (data.edges && Array.isArray(data.edges)) {
                data.edges.forEach((e: { from?: string | number, to?: string | number, label?: string }) => {
                  const fromId = e.from ? String(e.from).replace(/[^A-Za-z0-9_]/g, '') : '';
                  const toId = e.to ? String(e.to).replace(/[^A-Za-z0-9_]/g, '') : '';
                  if (!fromId || !toId) return;
                  const label = e.label ? `|"${String(e.label).replace(/"/g, '\\"')}"|` : '';
                  code += `  ${fromId} --> ${label} ${toId}\n`;
                });
              }
              finalMermaidCode = code;
            } else if (data.type === 'mindmap') {
              let code = `mindmap\n`;
              interface MindmapNode { label?: string; children?: MindmapNode[] }
              const parseNode = (node: MindmapNode, level: number) => {
                const indent = '  '.repeat(level);
                const safeLabel = String(node.label || '').replace(/"/g, '\\"');
                code += `${indent}("${safeLabel}")\n`;
                if (node.children && Array.isArray(node.children)) {
                  node.children.forEach((child: MindmapNode) => parseNode(child, level + 1));
                }
              };
              if (data.root) {
                parseNode(data.root, 1);
              }
              finalMermaidCode = code;
            }
          } catch (_e) {
            // Fallback: It's raw legacy Mermaid markdown from history.
            // AI_NOTE: The LLM frequently generates labels like D[Calculate B_n (Bernoulli Number)]
            // which have parentheses INSIDE square brackets. A simple regex can't handle nested
            // bracket characters reliably, so we use a character-by-character parser instead.
            // Rules:
            //  1. Find a node ID (alphanumeric + underscore/dash).
            //  2. Detect the opening bracket [ { ( ([ [(
            //  3. If the label does NOT already start with ", inject quotes.
            //  4. Strip trailing semicolons (LLM sometimes adds them).
            //  5. Sanitize subgraph titles that have no bracket at all.
            finalMermaidCode = chartCode.split('\n').map(rawLine => {
              // Strip trailing semicolons the LLM occasionally appends
              const line = rawLine.trimEnd().replace(/;$/, '');

              // --- SUBGRAPH TITLE FIX ---
              // subgraph lines with no bracket: e.g. "subgraph Calculation Details (Simplified)"
              const subgraphMatch = line.match(/^(\s*subgraph\s+)([^[""].*)$/);
              if (subgraphMatch) {
                const prefix = subgraphMatch[1];
                const title = subgraphMatch[2].trim();
                const safeId = 'sub_' + title.replace(/[^A-Za-z0-9]/g, '_');
                return `${prefix}${safeId} ["${title.replace(/"/g, '\\"')}"]`;
              }

              // --- NODE LABEL QUOTE INJECTION ---
              // AI_NOTE: We use SEPARATE replace calls per bracket shape (one-regex-per-shape).
              // Reason: A single combined regex must exclude the closing bracket from the content,
              // which incorrectly blocks () inside [] nodes (e.g. D[Calculate B_n (Bernoulli Number)]).
              // With separate calls, each shape only excludes its own closer from the content.
              // Skip already-quoted labels (label starts with ").
              let processed = line;

              // [rect] — content ends at first unescaped ]
              processed = processed.replace(
                /\b([A-Za-z0-9_-]+)\[([^"\]]+)\]/g,
                (_m, id, label) => `${id}["${label.replace(/"/g, '\\"').trim()}"]`
              );
              // {diamond} — content ends at first }
              processed = processed.replace(
                /\b([A-Za-z0-9_-]+)\{([^"}\n]+)\}/g,
                (_m, id, label) => `${id}{"${label.replace(/"/g, '\\"').trim()}"}`
              );
              // ([cylinder]) — content ends at first )]
              processed = processed.replace(
                /\b([A-Za-z0-9_-]+)\(\[([^"\]]+)\]\)/g,
                (_m, id, label) => `${id}(["${label.replace(/"/g, '\\"').trim()}"])`
              );
              // [(database)] — content ends at first )]
              processed = processed.replace(
                /\b([A-Za-z0-9_-]+)\[\(([^")]+)\)\]/g,
                (_m, id, label) => `${id}[("${label.replace(/"/g, '\\"').trim()}")]`
              );
              // (stadium) — content ends at first ) NOT followed by ]
              // Use negative lookahead so we don't eat ([cylinder]) shapes
              processed = processed.replace(
                /\b([A-Za-z0-9_-]+)\(([^")\n]+)\)(?!\])/g,
                (_m, id, label) => `${id}("${label.replace(/"/g, '\\"').trim()}")`
              );
              return processed;
            }).join('\n');
          }


          // Generate a unique ID for this render to avoid collisions in the DOM
          const uniqueId = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
          const { svg } = await mermaid.render(uniqueId, finalMermaidCode.trim());
          
          // Only inject if the component is still mounted AND this was the last render attempt
          if (isMounted && currentRenderId === renderCounterRef.current && containerRef.current) {
            containerRef.current.innerHTML = svg;

            const svgEl = containerRef.current.querySelector('svg');
            if (svgEl) {
              let naturalWidth = 0;
              let naturalHeight = 0;
              
              // Get natural dimensions from viewBox
              const vb = svgEl.getAttribute('viewBox') || svgEl.getAttribute('viewbox');
              if (vb) {
                const parts = vb.split(/[\s,]+/);
                if (parts.length === 4) {
                  naturalWidth = parseFloat(parts[2]);
                  naturalHeight = parseFloat(parts[3]);
                }
              }
              
              // Fallback to width/height attributes if viewBox is missing
              if (!naturalWidth || !naturalHeight) {
                const w = parseFloat(svgEl.getAttribute('width') || '0');
                const h = parseFloat(svgEl.getAttribute('height') || '0');
                if (w && h) {
                  naturalWidth = w;
                  naturalHeight = h;
                  svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
                }
              }
              
              // Remove attributes so they don't interfere with our styles
              svgEl.removeAttribute('width');
              svgEl.removeAttribute('height');
              
              // AI_NOTE: Gemini-style responsive SVG rendering
              // 1. width=100% allows it to shrink to fit the mobile screen width
              // 2. maxWidth limits it to its natural size so small diagrams don't look giant
              // 3. height=auto keeps aspect ratio
              // 4. No max-height, no overflow-auto: it just expands the message bubble downwards naturally.
              if (naturalWidth && naturalHeight) {
                svgEl.style.width = '100%';
                svgEl.style.maxWidth = `${naturalWidth}px`;
                svgEl.style.height = 'auto';
              } else {
                svgEl.style.width = '100%';
                svgEl.style.maxWidth = 'none';
                svgEl.style.height = 'auto';
              }
              
              svgEl.style.maxHeight = 'none';
              svgEl.style.display = 'block';
              svgEl.style.margin = '0 auto'; // Center if it's smaller than the container
            }
          }
          if (isMounted && containerRef.current) {
            setRenderedSvgHtml(containerRef.current.innerHTML);
          }
        }
      } catch (error: unknown) {
        console.error("Mermaid syntax error:", error);
        if (isMounted) setErrorMsg(error instanceof Error ? error.message : "Unknown Mermaid syntax error");
      }
    }

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [chartCode]);


  // Same wrapper styling as ChartRenderer to maintain UI consistency
  return (
    <div className="my-5 w-full max-w-full overflow-hidden flex flex-col relative group bg-transparent" style={{ minWidth: 0 }}>
      {/* Top Bar (Subtle & Hover-friendly) */}
      <div className="absolute right-0 top-0 z-10 p-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={() => setShowCode(!showCode)}
          className="text-xs font-medium text-muted-foreground hover:text-primary bg-background/80 backdrop-blur-sm shadow-sm transition-colors flex items-center gap-1 px-2 py-1 rounded-md"
          title="Toggle Code View"
        >
          <Code className="w-3.5 h-3.5" />
        </button>

        <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
          <DialogTrigger asChild>
            <button
              className="text-xs font-medium text-muted-foreground hover:text-primary bg-background/80 backdrop-blur-sm shadow-sm transition-colors flex items-center gap-1 px-2 py-1 rounded-md"
              title="Expand Diagram"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] w-full h-[90vh] sm:h-[80vh] flex flex-col p-6 sm:p-10 border-0 bg-background overflow-hidden">
             <DialogTitle className="sr-only">{t('chat.expandedDiagram')}</DialogTitle>
             <div className="flex-1 w-full min-h-0 mt-4 overflow-auto rounded-xl">
               {isFullscreen && (
                  <div 
                     className="w-full h-full flex justify-center items-center [&>svg]:!max-w-full [&>svg]:!w-auto [&>svg]:!h-auto" 
                     dangerouslySetInnerHTML={{ __html: renderedSvgHtml }} 
                  />
               )}
             </div>
          </DialogContent>
        </Dialog>
      </div>

      {showCode && (
        <div className="p-4 bg-secondary text-secondary-foreground font-mono text-sm overflow-x-auto whitespace-pre-wrap rounded-xl mt-8 border border-border">
          {chartCode.trim()}
        </div>
      )}
      
      {!showCode && errorMsg && (
        <div className="mt-8 p-4 bg-destructive/10 text-destructive rounded-xl border border-destructive/20 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {errorMsg}
        </div>
      )}

      <div className={`${showCode || errorMsg ? 'hidden' : 'flex'} pt-8 sm:pt-6 justify-center items-start w-full`}>
        <div ref={containerRef} className="mermaid-container w-full flex justify-center" />
      </div>
    </div>
  );
};
