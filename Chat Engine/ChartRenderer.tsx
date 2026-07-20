import React, { useMemo, useCallback } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, ScatterChart, Scatter,
  ReferenceDot, ReferenceLine
} from 'recharts';
import { Code, AlertTriangle, Maximize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { compile } from 'mathjs';
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '../../../../components/ui/dialog';

interface ChartDataPoint {
  [key: string]: string | number | boolean | null | undefined;
}

interface ChartConfig {
  type: 'function' | 'multiline' | 'bar' | 'line' | 'area' | 'pie' | 'scatter';
  title?: string;
  equation?: string;
  equations?: { equation: string; x_domain: [number, number] }[];
  series?: { label: string; equation: string }[];
  labels?: string[];
  data?: unknown[];
  x_domain?: [number, number];
  y_domain?: [number, number];
  points?: { x: number; y: number; color?: string; size?: number; filled?: boolean }[];
  vertical_asymptotes?: number[];
  y_unit?: string;
  x_unit?: string;
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#ef4444']; // Indigo, Violet, Pink, Teal, Amber, Red

const ChartContainerWrapper = ({ children, config, ScreenReaderTable }: { children: React.ReactNode, config: ChartConfig, ScreenReaderTable: React.FC }) => {
  const { t } = useTranslation();
  const [showCode, setShowCode] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  
  return (
    <div className="my-5 w-full max-w-full overflow-hidden flex flex-col relative group bg-transparent" style={{ minWidth: 0 }}>
      {/* Top Bar (Subtle & Hover-friendly) */}
      <div className="absolute right-0 top-0 z-10 p-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setShowCode(!showCode)}
          className="text-xs font-medium text-muted-foreground hover:text-primary bg-background/80 backdrop-blur-sm shadow-sm transition-colors flex items-center gap-1 px-2 py-1 rounded-md"
          title={t('chat.toggleDataView')}
        >
          <Code className="w-3.5 h-3.5" />
        </button>
        <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
          <DialogTrigger asChild>
            <button
              className="text-xs font-medium text-muted-foreground hover:text-primary bg-background/80 backdrop-blur-sm shadow-sm transition-colors flex items-center gap-1 px-2 py-1 rounded-md"
              title={t('chat.expandChart')}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] w-full h-[90vh] sm:h-[80vh] flex flex-col overflow-hidden p-6 sm:p-10 border-0 bg-background">
             <DialogTitle className="sr-only">{t('chat.expandedChart')}</DialogTitle>
             {config.title && <h4 className="text-lg font-bold text-foreground text-center break-words">{config.title}</h4>}
             <div className="flex-1 w-full min-h-0 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  {children as React.ReactElement}
                </ResponsiveContainer>
             </div>
          </DialogContent>
        </Dialog>
      </div>

      {showCode ? (
        <div className="p-4 bg-secondary text-secondary-foreground font-mono text-sm overflow-x-auto whitespace-pre-wrap text-left rounded-xl mt-8 border border-border">
          {JSON.stringify(config, null, 2)}
        </div>
      ) : (
        <div className="pt-8 sm:pt-6 w-full" style={{ minWidth: 0 }} role="img" aria-label={config.title || t('chat.interactiveDataVisualization')}>
          {config.title && <h4 className="text-sm font-bold text-foreground mb-4 text-center break-words whitespace-normal px-8">{config.title}</h4>}
          <div className="h-56 sm:h-64 w-full" style={{ minWidth: 0 }}>
            <ResponsiveContainer width="99%" height="100%">
              {children as React.ReactElement}
            </ResponsiveContainer>
          </div>
          <ScreenReaderTable />
        </div>
      )}
    </div>
  );
};

// Safe math function generator
const generateFunctionData = (equation: string, domain: [number, number], dataKey: string = 'y') => {
  try {
    const node = compile(equation);
    const [min, max] = domain;
    const points = [];
    const steps = 150; // Hard cap — prevents browser freeze on large domains
    const stepSize = (max - min) / steps;

    for (let i = 0; i <= steps; i++) {
      const xVal = min + i * stepSize;
      try {
        const yVal = node.evaluate({ x: xVal });
        // Filter out asymptotes and infinities
        if (typeof yVal === 'number' && !isNaN(yVal) && isFinite(yVal) && Math.abs(yVal) < 1e6) {
          points.push({ x: Number(xVal.toFixed(3)), [dataKey]: Number(yVal.toFixed(3)) });
        } else {
          points.push({ x: Number(xVal.toFixed(3)), [dataKey]: null });
        }
      } catch {
        // Ignore errors on individual points
      }
    }
    return points;
  } catch (e) {
    console.error("Error parsing math function:", e);
    return [];
  }
};

export const ChartRenderer: React.FC<{ config: ChartConfig }> = ({ config }) => {
  const { t } = useTranslation();

  const { chartData, type } = useMemo(() => {
    if (!config || !config.type) return { chartData: [], type: 'unknown' };

    let data: ChartDataPoint[] = [];
    if (config.type === 'function') {
      if (config.equations && Array.isArray(config.equations)) {
        config.equations.forEach((eq, idx) => {
          if (eq.equation && eq.x_domain) {
            const segmentData = generateFunctionData(eq.equation, eq.x_domain);
            data = [...data, ...segmentData];
            if (config.equations && idx < config.equations.length - 1) {
              data.push({ x: eq.x_domain[1], y: null });
            }
          }
        });
      } else if (config.equation && config.x_domain) {
        data = generateFunctionData(config.equation, config.x_domain);
      }
    } else if (config.type === 'multiline' && config.series && config.x_domain) {
      data = generateFunctionData('0', config.x_domain, 'dummy');
      config.series.forEach((s) => {
        const seriesData = generateFunctionData(s.equation, config.x_domain!, s.label);
        seriesData.forEach((point, i) => {
          if (data[i]) data[i][s.label] = point[s.label];
        });
      });
    } else if (['bar', 'line', 'area', 'pie'].includes(config.type)) {
      if (config.labels && config.data && Array.isArray(config.labels)) {
        // Standard format: labels: ["A", "B"], data: [1, 2]
        data = config.labels.map((label: string, idx: number) => {
          const val = Array.isArray(config.data) ? config.data[idx] : undefined;
          return {
            name: label,
            value: val !== undefined ? (val as number | string | null) : 0
          };
        });
      } else if (config.data && Array.isArray(config.data)) {
        // Nested AI format: data: [{name: "Series 1", data: [{x: 0, y: 0}]}]
        if (config.data.length > 0 && typeof config.data[0] === 'object' && (config.data as Array<Record<string, unknown>>)[0].data && Array.isArray((config.data as Array<Record<string, unknown>>)[0].data)) {
          data = ((config.data as Array<Record<string, unknown>>)[0].data as Array<Record<string, unknown>>).map((pt: Record<string, unknown>) => ({
            name: String(pt.x !== undefined ? pt.x : (pt.name !== undefined ? pt.name : '')),
            value: pt.y !== undefined ? (pt.y as number | string | null) : (pt.value !== undefined ? (pt.value as number | string | null) : 0)
          }));
        } 
        // Array of coordinates format: data: [{x: 0, y: 0}, {x: 1, y: 1}]
        else if (config.data.length > 0 && typeof config.data[0] === 'object') {
          data = (config.data as Record<string, unknown>[]).map((pt: Record<string, unknown>) => ({
            name: String(pt.x !== undefined ? pt.x : (pt.name !== undefined ? pt.name : '')),
            value: pt.y !== undefined ? (pt.y as number | string | null) : (pt.value !== undefined ? (pt.value as number | string | null) : 0)
          }));
        }
      }
    } else if (config.type === 'scatter' && config.points) {
      data = config.points;
    }

    return { chartData: data, type: config.type };
  }, [config]);

  // A11Y: Screen reader table
  const ScreenReaderTable = useCallback(() => (
    <div className="sr-only">
      <table>
        <caption>{config.title || `Chart of type ${type}`}</caption>
        <tbody>
          {chartData.map((d, i) => (
            <tr key={i}>
              <td>{String(d.name || d.x)}</td>
              <td>{String(d.value !== undefined ? d.value : Object.values(d).filter(v => typeof v === 'number').join(', '))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ), [chartData, config.title, type]);

  if (chartData.length === 0) {
    return (
      <ChartContainerWrapper config={config} ScreenReaderTable={() => <table className="sr-only"><caption>{t('chat.noData')}</caption></table>}>
        <div className="flex items-center justify-center h-full w-full text-muted-foreground text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mr-2" /> {t('chat.chartError')}
        </div>
      </ChartContainerWrapper>
    );
  }

  const formatTooltip = (val: unknown) => {
    return config.y_unit && val !== undefined && val !== null ? `${val} ${config.y_unit}` : (val as React.ReactNode);
  };

  switch (type) {
    case 'bar':
      return (
        <ChartContainerWrapper config={config} ScreenReaderTable={ScreenReaderTable}>
          <BarChart data={chartData} margin={{ bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" height={50} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'var(--color-muted)' }} contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card)', color: 'var(--color-foreground)', boxShadow: 'var(--shadow-glass)' }} formatter={formatTooltip} />
            <Bar dataKey="value" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainerWrapper>
      );
    case 'line':
    case 'function':
      return (
        <ChartContainerWrapper config={config} ScreenReaderTable={ScreenReaderTable}>
          <LineChart data={chartData} margin={{ bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey={type === 'function' ? 'x' : 'name'} type={type === 'function' ? 'number' : 'category'} tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} domain={type === 'function' ? (config.x_domain || ['dataMin', 'dataMax']) : undefined} angle={-35} textAnchor="end" height={50} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} domain={type === 'function' && config.y_domain ? config.y_domain : ['auto', 'auto']} />
            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card)', color: 'var(--color-foreground)', boxShadow: 'var(--shadow-glass)' }} formatter={formatTooltip} />
            <Line connectNulls={false} type="monotone" dataKey={type === 'function' ? 'y' : 'value'} stroke={COLORS[0]} strokeWidth={3} dot={type !== 'function'} activeDot={{ r: 6 }} />
            {type === 'function' && config.vertical_asymptotes?.map((asymptote, idx) => (
              <ReferenceLine key={`asymp-${idx}`} x={asymptote} stroke="var(--color-destructive)" strokeDasharray="5 5" strokeWidth={1.5} />
            ))}
            {type === 'function' && config.points?.map((pt, idx) => (
              <ReferenceDot
                key={`pt-${idx}`}
                x={pt.x}
                y={pt.y}
                r={pt.size || 4}
                fill={pt.filled ? (pt.color || COLORS[0]) : 'white'}
                stroke={pt.color || COLORS[0]}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        </ChartContainerWrapper>
      );
    case 'area':
      return (
        <ChartContainerWrapper config={config} ScreenReaderTable={ScreenReaderTable}>
          <AreaChart data={chartData} margin={{ bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" height={50} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card)', color: 'var(--color-foreground)', boxShadow: 'var(--shadow-glass)' }} formatter={formatTooltip} />
            <Area type="monotone" dataKey="value" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.2} strokeWidth={2} />
          </AreaChart>
        </ChartContainerWrapper>
      );
    case 'pie':
      return (
        <ChartContainerWrapper config={config} ScreenReaderTable={ScreenReaderTable}>
          <PieChart>
            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card)', color: 'var(--color-foreground)', boxShadow: 'var(--shadow-glass)' }} formatter={formatTooltip} />
            <Legend wrapperStyle={{ fontSize: '11px', color: 'var(--color-muted-foreground)', paddingTop: '10px' }} layout="horizontal" verticalAlign="bottom" />
            <Pie data={chartData} cx="50%" cy="45%" innerRadius="40%" outerRadius="70%" paddingAngle={5} dataKey="value">
              {chartData.map((_entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainerWrapper>
      );
    case 'scatter':
      return (
        <ChartContainerWrapper config={config} ScreenReaderTable={ScreenReaderTable}>
          <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="x" type="number" name={config.x_unit || 'X'} tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} />
            <YAxis dataKey="y" type="number" name={config.y_unit || 'Y'} tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card)', color: 'var(--color-foreground)', boxShadow: 'var(--shadow-glass)' }} formatter={formatTooltip} />
            <Scatter name="Data" data={chartData} fill={COLORS[0]} />
          </ScatterChart>
        </ChartContainerWrapper>
      );
    case 'multiline':
      return (
        <ChartContainerWrapper config={config} ScreenReaderTable={ScreenReaderTable}>
          <LineChart data={chartData} margin={{ bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="x" type="number" tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} domain={['dataMin', 'dataMax']} angle={-35} textAnchor="end" height={50} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card)', color: 'var(--color-foreground)', boxShadow: 'var(--shadow-glass)' }} formatter={formatTooltip} />
            <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--color-muted-foreground)', paddingTop: '10px' }} />
            {config.series?.map((s, idx) => (
              <Line key={idx} type="monotone" dataKey={s.label} stroke={COLORS[idx % COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
            ))}
          </LineChart>
        </ChartContainerWrapper>
      );
    default:
      return null;
  }
};
