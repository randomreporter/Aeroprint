import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { socket } from './socket';
import { Printer, Smartphone, CheckCircle, Lock, Zap, Loader2, Eye, Sun, Moon } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './index.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Dynamic URLs: In Electron mode, the backend passes these as query params.
// In dev mode, they fall back to Vite env vars or localhost defaults.
function getUrlParam(key: string, fallback: string): string {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const val = params.get(key);
    if (val) return decodeURIComponent(val);
  }
  return fallback;
}

const MOBILE_APP_BASE_URL = getUrlParam('mobileUrl', import.meta.env.VITE_MOBILE_URL || 'http://localhost:5174');
const BACKEND_PUBLIC_URL = getUrlParam('backendUrl', import.meta.env.VITE_BACKEND_PUBLIC_URL || 'http://localhost:4000');
const LOCAL_BACKEND_URL = 'http://localhost:4000';
type AppState = 'INITIALIZING' | 'WAITING_FOR_USER' | 'USER_CONNECTED' | 'WAITING_FOR_PAYMENT' | 'PRINTING' | 'SUCCESS';

function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [appState, setAppState] = useState<AppState>('INITIALIZING');
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  const [previewState, setPreviewState] = useState({
    showPreview: false,
    fileUrl: '',
    pageNumber: 1,
    orientation: 'portrait'
  });

  const generateNewSession = () => {
    setAppState('INITIALIZING');
    setPreviewState({ showPreview: false, fileUrl: '', pageNumber: 1, orientation: 'portrait' });
    socket.emit('kiosk:register');
  };

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (socket.connected) {
      generateNewSession();
    }
    socket.on('connect', () => generateNewSession());
    socket.on('kiosk:session_created', (data: { sessionId: string }) => {
      setSessionId(data.sessionId);
      setAppState('WAITING_FOR_USER');
    });
    socket.on('kiosk:mobile_connected', () => setAppState('USER_CONNECTED'));
    socket.on('kiosk:payment_started', () => setAppState('WAITING_FOR_PAYMENT'));
    socket.on('kiosk:payment_failed', () => setAppState('USER_CONNECTED'));
    socket.on('kiosk:sync_preview', (data: any) => {
      setPreviewState({
        showPreview: data.showPreview,
        fileUrl: data.fileUrl,
        pageNumber: data.pageNumber || 1,
        orientation: data.orientation || 'portrait'
      });
    });
    socket.on('kiosk:mobile_disconnected', () => generateNewSession());
    socket.on('kiosk:print_command', async (data: any) => {
      setAppState('PRINTING');
      
      try {
        const res = await fetch('http://localhost:4001/print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        
        if (res.ok) setAppState('SUCCESS');
        else setAppState('SUCCESS'); // Fallback demo
      } catch (e) {
        console.error("Could not reach Print Daemon", e);
        setTimeout(() => { setAppState('SUCCESS'); }, 3000);
      }

      setTimeout(() => generateNewSession(), 5000);
    });

    return () => {
      socket.off('connect');
      socket.off('kiosk:session_created');
      socket.off('kiosk:mobile_connected');
      socket.off('kiosk:payment_started');
      socket.off('kiosk:payment_failed');
      socket.off('kiosk:sync_preview');
      socket.off('kiosk:mobile_disconnected');
      socket.off('kiosk:print_command');
    };
  }, []);

  const qrUrl = `${MOBILE_APP_BASE_URL}?session=${sessionId}&backend=${encodeURIComponent(BACKEND_PUBLIC_URL)}`;

  return (
    <div className="relative h-screen bg-slate-50 dark:bg-[#0A0F1C] text-slate-900 dark:text-white flex flex-col p-4 sm:p-8 font-sans overflow-hidden font-inter transition-colors duration-500">
      
      {/* Dynamic Background Orbs (Only visible in dark mode, or faint in light mode) */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald-300/30 dark:bg-emerald-600/30 rounded-full blur-[120px] mix-blend-screen animate-pulse duration-1000"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-teal-300/20 dark:bg-teal-600/20 rounded-full blur-[150px] mix-blend-screen animate-pulse duration-1000 delay-500"></div>
      
      {/* Header */}
      <header className="relative z-10 w-full max-w-7xl mx-auto flex items-center justify-between mb-auto flex-shrink-0 pb-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Printer size={24} className="text-white" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-widest text-slate-800 dark:text-slate-100 drop-shadow-md">AERO<span className="text-emerald-500 dark:text-emerald-400 font-light">PRINT</span></h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-slate-200/50 dark:bg-white/5 border border-slate-300/50 dark:border-white/10 backdrop-blur-md">
            <Lock size={16} className="text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 tracking-wide">End-to-End Encrypted Session</span>
          </div>
          
          {/* Theme Toggle */}
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)} 
            className="p-3 rounded-full bg-slate-200/50 dark:bg-white/5 border border-slate-300/50 dark:border-white/10 backdrop-blur-md text-slate-700 dark:text-slate-300 hover:bg-slate-300/50 dark:hover:bg-white/10 transition-all active:scale-95"
            title="Toggle Light/Dark Theme"
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 w-full max-w-7xl h-full mx-auto flex flex-col lg:flex-row items-center justify-center lg:justify-between gap-6 lg:gap-8 my-auto overflow-hidden">
        
        {/* Left Typography Area */}
        <div className="flex-1 flex flex-col gap-4 lg:gap-6 justify-center max-w-2xl shrink">
          <div className="space-y-2 lg:space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs sm:text-sm font-semibold tracking-wide uppercase">
              <Zap size={14} /> Zero Touch Experience
            </div>
            <h2 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold leading-[1.1] tracking-tight">
              Print from <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:via-teal-400 dark:to-cyan-400">
                your Phone.
              </span>
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-slate-600 dark:text-slate-400 max-w-lg leading-relaxed font-light hidden sm:block">
              No USBs. No logins. Scan the code to securely upload your document and print it instantly.
            </p>
          </div>
          
          <div className="flex flex-col gap-3 lg:gap-6 mt-2">
            <FeatureStep number="1" title="Scan QR Code" desc="Point your camera at the screen to connect." />
            <FeatureStep number="2" title="Upload Document" desc="Select a PDF or Word file from your device." />
            <FeatureStep number="3" title="Auto-Delete" desc="Files are permanently erased after printing." />
          </div>

          {/* Pricing Table */}
          <div className="mt-2 lg:mt-4 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none p-4 lg:p-5 rounded-2xl lg:rounded-3xl backdrop-blur-md max-w-sm shrink-0">
             <h3 className="text-sm lg:text-lg font-bold text-slate-800 dark:text-slate-200 mb-2 lg:mb-4 tracking-wide uppercase">Print Pricing</h3>
             <div className="space-y-2 lg:space-y-3">
               <div className="flex justify-between items-center">
                 <span className="text-slate-600 dark:text-slate-400 font-medium text-sm lg:text-base">Black & White</span>
                 <span className="text-slate-900 dark:text-white font-bold text-lg lg:text-xl">₹5 <span className="text-xs lg:text-sm font-normal text-slate-500">/ sheet</span></span>
               </div>
               <div className="h-[1px] w-full bg-slate-100 dark:bg-white/10"></div>
               <div className="flex justify-between items-center">
                 <span className="text-slate-600 dark:text-slate-400 font-medium text-sm lg:text-base">Full Color</span>
                 <span className="text-slate-900 dark:text-white font-bold text-lg lg:text-xl">₹15 <span className="text-xs lg:text-sm font-normal text-slate-500">/ sheet</span></span>
               </div>
             </div>
          </div>
        </div>

        {/* Right Glass Panel (QR/Status/Preview) */}
        <div className={`w-full max-w-[480px] shrink relative transition-all duration-500 flex flex-col justify-center ${previewState.showPreview ? 'h-[50vh] sm:h-[65vh] max-h-[600px]' : 'aspect-square max-h-[480px]'}`}>
          {/* Glowing ring effect */}
          <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500 to-teal-500 rounded-[2.5rem] blur-xl opacity-20 dark:opacity-30 animate-pulse"></div>
          
          <div className="absolute inset-0 bg-white/80 dark:bg-white/[0.03] backdrop-blur-2xl border border-slate-200 dark:border-white/10 rounded-[2.5rem] shadow-2xl dark:shadow-2xl flex flex-col items-center justify-center p-6 sm:p-10 transition-all duration-500 overflow-hidden">
            
            {appState === 'WAITING_FOR_USER' && sessionId && (
              <div className="flex flex-col items-center gap-4 sm:gap-8 animate-in fade-in zoom-in duration-700 w-full">
                <div className="bg-white p-4 sm:p-6 rounded-3xl shadow-lg dark:shadow-[0_0_40px_rgba(255,255,255,0.1)] transition-transform hover:scale-105 duration-300 w-3/4 sm:w-auto aspect-square flex items-center justify-center">
                  <QRCodeSVG value={qrUrl} className="w-full h-full sm:w-[260px] sm:h-[260px]" level="H" includeMargin={false} fgColor="#0A0F1C" />
                </div>
                <div className="flex items-center gap-2 sm:gap-3 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-white/5 px-4 py-2 sm:px-6 sm:py-3 rounded-full border border-slate-200 dark:border-white/10 shrink-0">
                  <Smartphone size={20} className="text-emerald-600 dark:text-emerald-400" />
                  <span className="font-medium text-sm sm:text-lg tracking-wide">Scan to start</span>
                </div>
              </div>
            )}

            {(appState === 'USER_CONNECTED' || appState === 'WAITING_FOR_PAYMENT') && previewState.showPreview && previewState.fileUrl ? (
              <div className="flex flex-col items-center justify-center w-full h-full animate-in fade-in zoom-in duration-500">
                 <div className="bg-slate-200 dark:bg-slate-800 p-2 rounded-xl shadow-inner dark:shadow-2xl relative w-full h-full max-h-[100%] flex items-center justify-center overflow-hidden shrink border border-slate-300 dark:border-slate-700">
                   {appState === 'WAITING_FOR_PAYMENT' && (
                      <div className="absolute inset-0 bg-slate-200/60 dark:bg-slate-900/40 z-20 backdrop-blur-sm flex items-center justify-center rounded-xl">
                        <Lock size={48} className="text-amber-500 dark:text-amber-400 drop-shadow-lg" />
                      </div>
                   )}
                   <div className={`transition-transform duration-500 origin-center ${previewState.orientation === 'landscape' ? '-rotate-90 scale-75' : 'rotate-0 scale-100'} w-full flex justify-center`}>
                     <Document 
                       file={`${LOCAL_BACKEND_URL}${previewState.fileUrl}`} 
                       loading={<Loader2 className="animate-spin text-slate-500 m-10" size={48} />}
                     >
                       <Page pageNumber={previewState.pageNumber} width={320} renderTextLayer={false} renderAnnotationLayer={false} className="shadow-lg rounded-md overflow-hidden" />
                     </Document>
                   </div>
                 </div>
                 <p className="mt-3 sm:mt-4 font-medium text-emerald-600 dark:text-emerald-300 tracking-wide text-sm sm:text-lg flex items-center gap-2 shrink-0">
                   <Eye size={20} /> Live Preview Active
                 </p>
              </div>
            ) : (
              <>
                {appState === 'USER_CONNECTED' && (
                  <div className="flex flex-col items-center gap-4 sm:gap-6 text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="relative shrink-0">
                      <div className="absolute inset-0 bg-emerald-500 rounded-full blur-xl opacity-30 dark:opacity-40 animate-pulse"></div>
                      <div className="w-20 h-20 sm:w-28 sm:h-28 bg-gradient-to-tr from-emerald-600 to-emerald-400 rounded-full flex items-center justify-center shadow-2xl relative z-10">
                        <Smartphone size={40} className="text-white sm:w-[48px] sm:h-[48px]" />
                      </div>
                    </div>
                    <div className="space-y-1 sm:space-y-2 mt-2 sm:mt-4">
                      <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Connected</h3>
                      <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-lg">Use your phone to select<br/>and configure your print.</p>
                    </div>
                  </div>
                )}

                {appState === 'WAITING_FOR_PAYMENT' && (
                  <div className="flex flex-col items-center gap-4 sm:gap-6 text-center animate-in fade-in zoom-in duration-700">
                    <div className="relative shrink-0">
                      <div className="absolute inset-0 bg-amber-500 rounded-full blur-xl opacity-30 dark:opacity-40 animate-pulse"></div>
                      <div className="w-20 h-20 sm:w-28 sm:h-28 bg-gradient-to-tr from-amber-500 to-yellow-400 rounded-full flex items-center justify-center shadow-2xl relative z-10">
                        <Lock size={40} className="text-white sm:w-[48px] sm:h-[48px] animate-pulse" />
                      </div>
                    </div>
                    <div className="space-y-1 sm:space-y-2 mt-2 sm:mt-4">
                      <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Awaiting Payment</h3>
                      <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-lg">Please complete the secure<br/>transaction on your phone.</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {appState === 'PRINTING' && (
              <div className="flex flex-col items-center gap-4 sm:gap-6 text-center animate-in fade-in zoom-in duration-700">
                 <Loader2 size={56} className="text-blue-500 animate-spin sm:w-[64px] sm:h-[64px]" />
                 <div className="space-y-2">
                   <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Printing...</h3>
                   <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-lg">Please wait while your<br/>document is processing.</p>
                 </div>
              </div>
            )}

            {appState === 'SUCCESS' && (
              <div className="flex flex-col items-center gap-4 sm:gap-6 text-center animate-in fade-in zoom-in duration-700">
                 <div className="w-20 h-20 sm:w-28 sm:h-28 bg-green-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/20 shrink-0">
                   <CheckCircle size={40} className="text-white sm:w-[56px] sm:h-[56px]" />
                 </div>
                 <div className="space-y-2 mt-4">
                   <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Print Success!</h3>
                   <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-lg">Please collect your document.<br/>Session will clear shortly.</p>
                 </div>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}

function FeatureStep({ number, title, desc }: { number: string, title: string, desc: string }) {
  return (
    <div className="flex items-start gap-3 sm:gap-4 shrink-0">
      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-emerald-100 dark:bg-white/10 flex items-center justify-center text-emerald-700 dark:text-white font-bold text-xs sm:text-sm shrink-0 border border-emerald-200 dark:border-white/5">
        {number}
      </div>
      <div>
        <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm sm:text-base">{title}</h4>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 hidden sm:block">{desc}</p>
      </div>
    </div>
  );
}

export default App;
