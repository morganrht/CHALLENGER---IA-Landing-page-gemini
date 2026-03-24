import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, GenerateContentResponse, ThinkingLevel } from "@google/genai";
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  Timestamp 
} from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  User, 
  LogOut, 
  Mail, 
  MessageSquare, 
  Settings, 
  ChevronRight, 
  Zap, 
  Shield, 
  Target, 
  Eye, 
  EyeOff, 
  Loader2, 
  AlertCircle,
  CheckCircle2,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import Markdown from 'react-markdown';
import { cn } from './lib/utils';

// --- Types ---

type FrictionLevel = 'soft' | 'medium' | 'extreme';

interface Persona {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  systemInstruction: string;
}

interface ChatMessage {
  id?: string;
  userId: string;
  role: 'user' | 'model';
  content: string;
  timestamp: any;
  friction?: FrictionLevel;
  persona?: string;
}

// --- Constants ---

const PERSONAS: Persona[] = [
  {
    id: 'socratic',
    name: 'Socratic Guide',
    description: 'Uses the Socratic method to help you discover truth through questioning.',
    icon: <Target className="w-5 h-5" />,
    systemInstruction: "You are a Socratic Guide. Your goal is to help the user refine their thinking by asking deep, probing questions instead of providing direct answers. Never agree blindly. Challenge assumptions. Use 'maïeutique' (midwifery of the mind) to help them 'give birth' to their own insights."
  },
  {
    id: 'devil',
    name: 'Devil\'s Advocate',
    description: 'Attacks your thesis frontally to find weaknesses in your logic.',
    icon: <Shield className="w-5 h-5" />,
    systemInstruction: "You are the Devil's Advocate. Your job is to find every possible flaw, contradiction, and weakness in the user's arguments. Be critical, skeptical, and relentless. Force them to defend their position with evidence and logic. Your goal is to break their argument so they can build a stronger one."
  },
  {
    id: 'architect',
    name: 'Logic Architect',
    description: 'Focuses on the structural integrity and coherence of your reasoning.',
    icon: <Zap className="w-5 h-5" />,
    systemInstruction: "You are a Logic Architect. You analyze the structure of the user's reasoning. Point out logical fallacies, circular reasoning, and non-sequiturs. Help them build a more robust and coherent framework for their ideas."
  }
];

const FRICTION_CONFIG: Record<FrictionLevel, { label: string; description: string; color: string }> = {
  soft: { 
    label: 'Soft', 
    description: 'Gentle questioning and clarification.', 
    color: 'bg-green-500' 
  },
  medium: { 
    label: 'Medium', 
    description: 'Rational skepticism and demand for proof.', 
    color: 'bg-yellow-500' 
  },
  extreme: { 
    label: 'Extreme', 
    description: 'Frontal attack on your thesis.', 
    color: 'bg-red-500' 
  }
};

// --- Components ---

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [errorInfo, setErrorInfo] = useState<string | null>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setHasError(true);
      setErrorInfo(event.error?.message || 'An unexpected error occurred.');
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-red-50 p-6 text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-red-900 mb-2">Something went wrong</h1>
        <p className="text-red-700 mb-4 max-w-md">{errorInfo}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Reload Application
        </button>
      </div>
    );
  }

  return <>{children}</>;
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'newsletter'>('newsletter');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Newsletter State
  const [email, setEmail] = useState('');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [subscribeStatus, setSubscribeStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [friction, setFriction] = useState<FrictionLevel>('medium');
  const [persona, setPersona] = useState<Persona>(PERSONAS[0]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Image Gen State
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (u) {
        // Create/Update user profile
        await setDoc(doc(db, 'users', u.uid), {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          role: u.email === 'Morgan19.reichert@gmail.com' ? 'admin' : 'user'
        }, { merge: true });

        // Load chat history
        const q = query(collection(db, 'users', u.uid, 'chats'), orderBy('timestamp', 'asc'), limit(50));
        onSnapshot(q, (snapshot) => {
          const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage));
          setMessages(msgs);
        });
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Sign in error:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsSubscribing(true);
    setSubscribeStatus('idle');
    try {
      await setDoc(doc(collection(db, 'subscribers')), {
        email,
        subscribedAt: Timestamp.now()
      });
      setSubscribeStatus('success');
      setEmail('');
    } catch (error) {
      console.error('Subscription error:', error);
      setSubscribeStatus('error');
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user || isSending) return;

    const userMsg: ChatMessage = {
      userId: user.uid,
      role: 'user',
      content: input,
      timestamp: Timestamp.now(),
      friction,
      persona: persona.id
    };

    setIsSending(true);
    setInput('');

    try {
      // Save user message
      await setDoc(doc(collection(db, 'users', user.uid, 'chats')), userMsg);

      // Call Gemini
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const modelName = friction === 'extreme' ? 'gemini-3.1-pro-preview' : 'gemini-3-flash-preview';
      
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          ...messages.map(m => ({ role: m.role, parts: [{ text: m.content }] })),
          { role: 'user', parts: [{ text: input }] }
        ],
        config: {
          systemInstruction: `${persona.systemInstruction} Current friction level: ${friction}. ${FRICTION_CONFIG[friction].description}`,
          temperature: friction === 'extreme' ? 1.0 : 0.7,
          topP: 0.95,
          topK: 64,
          thinkingConfig: { thinkingLevel: friction === 'extreme' ? ThinkingLevel.HIGH : ThinkingLevel.LOW }
        }
      });

      const modelMsg: ChatMessage = {
        userId: user.uid,
        role: 'model',
        content: response.text || 'I am processing your thought...',
        timestamp: Timestamp.now(),
        friction,
        persona: persona.id
      };

      // Save model message
      await setDoc(doc(collection(db, 'users', user.uid, 'chats')), modelMsg);
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsSending(false);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#E4E3E0]">
        <Loader2 className="w-12 h-12 animate-spin text-[#141414]" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
        {/* Navigation */}
        <nav className="border-b border-[#141414] sticky top-0 bg-[#E4E3E0]/80 backdrop-blur-md z-50">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#141414] flex items-center justify-center">
                <Target className="w-5 h-5 text-[#E4E3E0]" />
              </div>
              <span className="font-bold text-xl tracking-tighter uppercase">Challenger IA</span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <button onClick={() => setActiveTab('newsletter')} className={cn("text-xs uppercase font-bold tracking-widest hover:opacity-50 transition-opacity", activeTab === 'newsletter' && "underline underline-offset-4")}>Newsletter</button>
              <button onClick={() => setActiveTab('chat')} className={cn("text-xs uppercase font-bold tracking-widest hover:opacity-50 transition-opacity", activeTab === 'chat' && "underline underline-offset-4")}>Gymnase Mental</button>
            </div>

            <div className="flex items-center gap-4">
              {user ? (
                <div className="flex items-center gap-3">
                  <span className="hidden sm:inline text-xs font-mono opacity-60">{user.email}</span>
                  <button onClick={handleSignOut} className="p-2 border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-all">
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button onClick={handleSignIn} className="px-4 py-2 bg-[#141414] text-[#E4E3E0] text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-opacity">
                  Sign In
                </button>
              )}
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto px-4 py-12">
          <AnimatePresence mode="wait">
            {activeTab === 'newsletter' && (
              <motion.div 
                key="newsletter"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
              >
                <div>
                  <h1 className="text-7xl md:text-9xl font-bold tracking-tighter leading-[0.85] uppercase mb-8">
                    L'Avenir est <br /> <span className="italic font-serif font-light lowercase">Critique</span>
                  </h1>
                  <p className="text-xl max-w-lg mb-8 opacity-80">
                    Nous ne vendons pas du confort, mais de la difficulté bénéfique. Rejoignez la révolution de la pensée analytique.
                  </p>
                  
                  <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-4 max-w-md">
                    <input 
                      type="email" 
                      placeholder="votre@email.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="flex-1 bg-transparent border-b-2 border-[#141414] py-3 px-2 focus:outline-none focus:border-opacity-50 transition-all font-mono text-lg"
                    />
                    <button 
                      type="submit"
                      disabled={isSubscribing}
                      className="bg-[#141414] text-[#E4E3E0] px-8 py-3 font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all"
                    >
                      {isSubscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'S\'inscrire'}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                  
                  {subscribeStatus === 'success' && (
                    <p className="mt-4 text-green-600 font-bold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Bienvenue au gymnase mental.
                    </p>
                  )}
                  {subscribeStatus === 'error' && (
                    <p className="mt-4 text-red-600 font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" /> Une erreur est survenue.
                    </p>
                  )}
                </div>

                <div className="relative">
                  <div className="aspect-square bg-[#141414] p-8 flex flex-col justify-between group overflow-hidden">
                    <div className="flex justify-between items-start">
                      <span className="text-[#E4E3E0] font-mono text-sm opacity-50">01 / CHALLENGER</span>
                      <Sparkles className="w-8 h-8 text-[#E4E3E0] animate-pulse" />
                    </div>
                    <div className="space-y-4">
                      <div className="h-1 bg-[#E4E3E0] w-1/3 group-hover:w-full transition-all duration-700"></div>
                      <h2 className="text-[#E4E3E0] text-4xl font-bold leading-tight">
                        "ES-TU SÛR ?" <br />
                        <span className="text-2xl opacity-60">Plutôt que "Tu as raison".</span>
                      </h2>
                    </div>
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                      className="absolute -bottom-20 -right-20 w-64 h-64 border border-[#E4E3E0]/20 rounded-full flex items-center justify-center"
                    >
                      <div className="w-48 h-48 border border-[#E4E3E0]/10 rounded-full"></div>
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'chat' && (
              <motion.div 
                key="chat"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="grid grid-cols-1 lg:grid-cols-4 gap-8 h-[70vh]"
              >
                {/* Chat Sidebar */}
                <div className="lg:col-span-1 space-y-6">
                  <div className="p-6 border border-[#141414] bg-white/50">
                    <h3 className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Settings className="w-3 h-3" /> Configuration
                    </h3>
                    
                    <div className="space-y-6">
                      <div>
                        <label className="text-[10px] uppercase font-bold opacity-50 mb-2 block">Persona</label>
                        <div className="space-y-2">
                          {PERSONAS.map(p => (
                            <button
                              key={p.id}
                              onClick={() => setPersona(p)}
                              className={cn(
                                "w-full text-left p-3 flex items-center gap-3 border border-transparent transition-all",
                                persona.id === p.id ? "bg-[#141414] text-[#E4E3E0]" : "hover:border-[#141414]"
                              )}
                            >
                              {p.icon}
                              <div>
                                <div className="text-xs font-bold">{p.name}</div>
                                <div className="text-[9px] opacity-60 line-clamp-1">{p.description}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-bold opacity-50 mb-2 block">Friction Level</label>
                        <div className="grid grid-cols-3 gap-1">
                          {(Object.keys(FRICTION_CONFIG) as FrictionLevel[]).map(f => (
                            <button
                              key={f}
                              onClick={() => setFriction(f)}
                              className={cn(
                                "py-2 text-[10px] font-bold uppercase tracking-tighter border border-[#141414] transition-all",
                                friction === f ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#141414]/5"
                              )}
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-[9px] opacity-60 italic">
                          {FRICTION_CONFIG[friction].description}
                        </p>
                      </div>
                    </div>
                  </div>

                  {!user && (
                    <div className="p-6 bg-[#141414] text-[#E4E3E0]">
                      <h4 className="text-xs font-bold uppercase mb-2">Accès Restreint</h4>
                      <p className="text-[10px] opacity-70 mb-4">Connectez-vous pour sauvegarder votre progression et accéder aux modes extrêmes.</p>
                      <button onClick={handleSignIn} className="w-full py-2 border border-[#E4E3E0] text-[10px] font-bold uppercase hover:bg-[#E4E3E0] hover:text-[#141414] transition-all">
                        Sign In
                      </button>
                    </div>
                  )}
                </div>

                {/* Chat Main */}
                <div className="lg:col-span-3 flex flex-col border border-[#141414] bg-white overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {messages.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                        <MessageSquare className="w-12 h-12 mb-4" />
                        <p className="text-sm font-mono uppercase tracking-widest">Initialisez le dialogue</p>
                      </div>
                    )}
                    {messages.map((m, i) => (
                      <motion.div 
                        key={i}
                        initial={{ opacity: 0, x: m.role === 'user' ? 20 : -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={cn(
                          "flex gap-4 max-w-[85%]",
                          m.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                        )}
                      >
                        <div className={cn(
                          "w-8 h-8 shrink-0 flex items-center justify-center border border-[#141414]",
                          m.role === 'user' ? "bg-[#141414] text-[#E4E3E0]" : "bg-[#E4E3E0]"
                        )}>
                          {m.role === 'user' ? <User className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                        </div>
                        <div className={cn(
                          "p-4 border border-[#141414] text-sm leading-relaxed",
                          m.role === 'user' ? "bg-gray-50" : "bg-white"
                        )}>
                          <div className="prose prose-sm max-w-none">
                            <Markdown>{m.content}</Markdown>
                          </div>
                          <div className="mt-2 text-[9px] opacity-40 font-mono flex items-center gap-2">
                            {m.timestamp?.toDate?.().toLocaleTimeString() || 'Just now'}
                            {m.friction && <span className="uppercase tracking-tighter">[{m.friction}]</span>}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    {isSending && (
                      <div className="flex gap-4 mr-auto">
                        <div className="w-8 h-8 shrink-0 flex items-center justify-center border border-[#141414] bg-[#E4E3E0]">
                          <Zap className="w-4 h-4 animate-pulse" />
                        </div>
                        <div className="p-4 border border-[#141414] bg-white italic text-xs opacity-50">
                          Challenger analyse votre thèse...
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <form onSubmit={handleSendMessage} className="p-4 border-t border-[#141414] bg-gray-50 flex gap-4">
                    <input 
                      type="text" 
                      placeholder={user ? "Saisissez votre argument..." : "Connectez-vous pour chatter"}
                      disabled={!user || isSending}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      className="flex-1 bg-white border border-[#141414] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#141414]/10 transition-all"
                    />
                    <button 
                      type="submit"
                      disabled={!user || isSending || !input.trim()}
                      className="bg-[#141414] text-[#E4E3E0] px-6 py-3 font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                      {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </form>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="border-t border-[#141414] py-12 mt-24">
          <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-5 h-5" />
                <span className="font-bold uppercase tracking-tighter">Challenger IA</span>
              </div>
              <p className="text-xs opacity-60 leading-relaxed">
                Le premier outil grand public qui ose la contradiction constructive. <br />
                © 2026 Morgan Reichert - Challenger IA
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase opacity-40">Navigation</h4>
                <ul className="text-xs space-y-1 font-bold">
                  <li><button onClick={() => setActiveTab('newsletter')} className="hover:underline">Newsletter</button></li>
                  <li><button onClick={() => setActiveTab('chat')} className="hover:underline">Gymnase Mental</button></li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase opacity-40">Legal</h4>
                <ul className="text-xs space-y-1 font-bold">
                  <li><button className="hover:underline">Privacy</button></li>
                  <li><button className="hover:underline">Terms</button></li>
                </ul>
              </div>
            </div>
            <div className="flex flex-col justify-between items-end">
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase opacity-40 mb-1">Status</div>
                <div className="flex items-center gap-2 text-green-600 font-bold text-xs">
                  <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
                  Systèmes Opérationnels
                </div>
              </div>
              <p className="text-[10px] font-mono opacity-40">v1.0.4-stable</p>
            </div>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
