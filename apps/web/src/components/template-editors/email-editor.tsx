'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { EditorRef } from 'react-email-editor';
import html2canvas from 'html2canvas';

// Dynamically import EmailEditor to avoid SSR issues
const EmailEditorComponent = dynamic(
  () => import('react-email-editor').then((mod) => mod.default),
  {
    ssr: false,
    loading: () => (
      <div className="bg-muted flex h-[600px] items-center justify-center rounded-lg">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    ),
  }
);

export interface EmailEditorRef {
  exportHtml: () => Promise<{ html: string; design: Record<string, unknown> }>;
  exportImage: () => Promise<{ url: string }>; // Export as PNG data URL
  loadDesign: (design: Record<string, unknown>) => void;
}

interface EmailEditorProps {
  initialDesign?: Record<string, unknown> | null;
  onReady?: () => void;
  onLoad?: () => void;
  minHeight?: number;
  editorRef?: React.MutableRefObject<EmailEditorRef | null>;
}

// Merge tags for variable insertion (Unlayer format)
const mergeTags = {
  contact: {
    name: 'Contact',
    mergeTags: {
      first_name: { name: 'First Name', value: '{{first_name}}' },
      last_name: { name: 'Last Name', value: '{{last_name}}' },
      email: { name: 'Email', value: '{{email}}' },
      phone: { name: 'Phone', value: '{{phone}}' },
      company: { name: 'Company', value: '{{company}}' },
    },
  },
  system: {
    name: 'System',
    mergeTags: {
      unsubscribe_url: { name: 'Unsubscribe Link', value: '{{unsubscribe_url}}' },
      web_version_url: { name: 'View in Browser', value: '{{web_version_url}}' },
    },
  },
};

// Editor configuration
const editorOptions: Record<string, unknown> = {
  features: {
    textEditor: {
      spellChecker: true,
    },
  },
  tools: {
    image: {
      enabled: true,
    },
  },
  mergeTags,
};

const appearance: Record<string, unknown> = {
  theme: 'modern_light',
  panels: {
    tools: {
      dock: 'left',
    },
  },
};

export function EmailEditor({
  initialDesign,
  onReady,
  onLoad,
  minHeight = 600,
  editorRef,
}: EmailEditorProps) {
  const emailEditorRef = useRef<EditorRef | null>(null);
  const unlayerEditorRef = useRef<any>(null); // Store the actual unlayer editor instance
  const [isEditorReady, setIsEditorReady] = useState(false);
  const hasLoadedInitialDesign = useRef(false);

  const handleReady = useCallback(
    (unlayer: any) => {
      console.log('[EmailEditor] Editor ready event fired, unlayer:', !!unlayer);
      // Store the unlayer editor instance directly from the callback
      unlayerEditorRef.current = unlayer;
      setIsEditorReady(true);
      onReady?.();
    },
    [onReady]
  );

  const handleLoad = useCallback(() => {
    console.log('[EmailEditor] Editor load event fired');
    onLoad?.();
  }, [onLoad]);

  // Load initial design when editor is ready AND we have design data
  useEffect(() => {
    console.log('[EmailEditor] useEffect check:', {
      isEditorReady,
      hasInitialDesign: !!initialDesign,
      initialDesignKeys: initialDesign ? Object.keys(initialDesign) : [],
      hasUnlayerEditor: !!unlayerEditorRef.current,
      hasLoadedInitialDesign: hasLoadedInitialDesign.current,
    });

    if (
      isEditorReady &&
      initialDesign &&
      unlayerEditorRef.current &&
      !hasLoadedInitialDesign.current
    ) {
      console.log('[EmailEditor] Loading initial design now:', {
        designKeys: Object.keys(initialDesign),
        designPreview: JSON.stringify(initialDesign).substring(0, 300),
      });
      unlayerEditorRef.current.loadDesign(initialDesign);
      hasLoadedInitialDesign.current = true;
      console.log('[EmailEditor] Design loaded successfully');
    }
  }, [isEditorReady, initialDesign]);

  // Expose methods via ref
  useEffect(() => {
    if (editorRef) {
      editorRef.current = {
        exportHtml: () => {
          return new Promise((resolve, reject) => {
            if (!unlayerEditorRef.current) {
              reject(new Error('Editor not ready'));
              return;
            }
            unlayerEditorRef.current.exportHtml((data: any) => {
              resolve({
                html: data.html,
                design: data.design,
              });
            });
          });
        },
        exportImage: async () => {
          if (!unlayerEditorRef.current) {
            throw new Error('Editor not ready');
          }

          // Get HTML from Unlayer
          const htmlData = await new Promise<{ html: string }>((resolve) => {
            unlayerEditorRef.current.exportHtml((data: any) => {
              resolve({ html: data.html });
            });
          });

          // Create a hidden iframe to render the HTML
          const iframe = document.createElement('iframe');
          iframe.style.cssText =
            'position:fixed;left:-9999px;top:-9999px;width:600px;height:800px;border:none;';
          document.body.appendChild(iframe);

          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!iframeDoc) throw new Error('Could not access iframe document');

            // Write the HTML content
            iframeDoc.open();
            iframeDoc.write(`
              <!DOCTYPE html>
              <html>
                <head>
                  <style>
                    body { margin: 0; padding: 0; background: white; }
                  </style>
                </head>
                <body>${htmlData.html}</body>
              </html>
            `);
            iframeDoc.close();

            // Wait for content to render
            await new Promise((resolve) => setTimeout(resolve, 500));

            // Capture with html2canvas
            const canvas = await html2canvas(iframeDoc.body, {
              width: 600,
              height: 400,
              scale: 0.5, // Smaller for thumbnail
              useCORS: true,
              allowTaint: true,
              backgroundColor: '#ffffff',
            });

            const url = canvas.toDataURL('image/png', 0.8);
            return { url };
          } finally {
            // Cleanup
            document.body.removeChild(iframe);
          }
        },
        loadDesign: (design: Record<string, unknown>) => {
          if (unlayerEditorRef.current) {
            unlayerEditorRef.current.loadDesign(design);
          }
        },
      };
    }
  }, [editorRef, isEditorReady]);

  return (
    <div className="overflow-hidden rounded-lg border">
      <EmailEditorComponent
        ref={emailEditorRef}
        onReady={handleReady}
        onLoad={handleLoad}
        minHeight={minHeight}
        options={editorOptions}
        appearance={appearance}
      />
    </div>
  );
}

export default EmailEditor;
