"use client";

import { UI } from "@/constants/ui";
import { useState, useRef } from "react";
import { validateTop50, createTop50Playlist } from "@/hooks/use-playlists";
import { SlidePanel } from "./slide-panel";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { AlertCircle, Check, Loader2, BarChart3, Calendar, ImageIcon, X } from "lucide-react";

interface TopStatsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface ValidationData {
    trackCount: number;
    confirmationToken: string;
    warnings: string[];
}

interface ApiError {
    response?: {
        data?: {
            error?: string;
        };
    };
}

export function TopStatsModal({ isOpen, onClose }: TopStatsModalProps) {
    const [step, setStep] = useState<'input' | 'validating' | 'confirm' | 'creating' | 'success'>('input');
    const [term, setTerm] = useState<'short' | 'medium' | 'long' | 'all_time'>('medium');
    const [playlistName, setPlaylistName] = useState("");
    const [coverImage, setCoverImage] = useState<string | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [validationData, setValidationData] = useState<ValidationData | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const { isDemo } = useDemoMode();

    const resetState = () => {
        setStep('input');
        setTerm('medium');
        setPlaylistName("");
        setCoverImage(null);
        setCoverPreview(null);
        setError(null);
        setValidationData(null);
    };

    const handleClose = () => {
        onClose();
        setTimeout(resetState, 300);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 256 * 1024) {
            setError("Image must be less than 256KB");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            setCoverPreview(base64);
            setCoverImage(base64.split(',')[1]);
        };
        reader.readAsDataURL(file);
    };



    const handleValidate = async () => {
        setStep('validating');
        setError(null);

        try {
            const data = await validateTop50(term);
            setValidationData(data);

            const termLabel = {
                short: UI.PLAYLIST.TOP_STATS.RANGES.SHORT,
                medium: UI.PLAYLIST.TOP_STATS.RANGES.MEDIUM,
                long: UI.PLAYLIST.TOP_STATS.RANGES.LONG,
                all_time: UI.PLAYLIST.TOP_STATS.RANGES.ALL_TIME
            }[term];

            if (!playlistName) {
                setPlaylistName(`Top 50: ${termLabel}`);
            }

            setStep('confirm');
        } catch (err: unknown) {
            const apiError = err as ApiError;
            setError(apiError.response?.data?.error || "Failed to validate top tracks");
            setStep('input');
        }
    };

    const handleCreate = async () => {
        if (!validationData || !playlistName) return;

        setStep('creating');
        setError(null);

        try {
            await createTop50Playlist({
                name: playlistName,
                term,
                confirmationToken: validationData.confirmationToken,
                coverImageBase64: coverImage || undefined,
                isPublic: false
            });
            setStep('success');
        } catch (err: unknown) {
            const apiError = err as ApiError;
            setError(apiError.response?.data?.error || "Failed to create playlist");
            setStep('confirm');
        }
    };

    const renderFooter = () => {
        if (step === 'success') {
            return (
                <button
                    onClick={handleClose}
                    className="w-full px-6 py-3 rounded-lg bg-mint-500 text-black font-bold hover:bg-mint-400 transition-colors"
                >
                    {UI.PLAYLIST.COMMON.ACTIONS.DONE}
                </button>
            );
        }

        return (
            <div className="flex justify-end gap-3">
                <button
                    onClick={step === 'confirm' ? () => setStep('input') : handleClose}
                    className="px-4 py-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                    disabled={step === 'validating' || step === 'creating'}
                >
                    {step === 'confirm' ? UI.PLAYLIST.COMMON.ACTIONS.BACK : UI.PLAYLIST.COMMON.ACTIONS.CANCEL}
                </button>

                {step === 'input' && (
                    <button
                        onClick={handleValidate}
                        disabled={isDemo}
                        className={`px-6 py-3 rounded-lg font-bold transition-colors ${isDemo
                            ? 'bg-neutral-800 text-white/40 cursor-not-allowed'
                            : 'bg-mint-500 text-black hover:bg-mint-400'
                            }`}
                    >
                        {isDemo ? "Demo Unavailable" : UI.PLAYLIST.COMMON.ACTIONS.CONTINUE}
                    </button>
                )}

                {step === 'confirm' && (
                    <button
                        onClick={handleCreate}
                        disabled={!playlistName || isDemo}
                        className="px-6 py-3 rounded-lg bg-mint-500 text-black font-bold hover:bg-mint-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isDemo ? "Demo Unavailable" : UI.PLAYLIST.COMMON.ACTIONS.CREATE}
                    </button>
                )}
            </div>
        );
    };

    return (
        <SlidePanel
            isOpen={isOpen}
            onClose={handleClose}
            title={UI.PLAYLIST.TOP_STATS.TITLE}
            footer={renderFooter()}
        >
            {/* Feature Description */}
            <div className="mb-6 pb-6 border-b border-white/10">
                <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-mint-500/20">
                        <BarChart3 className="w-5 h-5 text-mint-400" />
                    </div>
                    <span className="text-base font-medium text-white/90">{UI.PLAYLIST.TOP_STATS.SUBTITLE}</span>
                </div>
                <p className="text-white/70 text-sm leading-relaxed">
                    {UI.PLAYLIST.TOP_STATS.DESCRIPTION}
                </p>
            </div>

            <div className="space-y-6">
                {step === 'input' && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-white/60 mb-3">{UI.PLAYLIST.TOP_STATS.INPUT.SELECT_RANGE_LABEL}</label>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { id: 'short', label: UI.PLAYLIST.TOP_STATS.RANGES.SHORT, icon: ClockIcon },
                                    { id: 'medium', label: UI.PLAYLIST.TOP_STATS.RANGES.MEDIUM, icon: Calendar },
                                    { id: 'long', label: UI.PLAYLIST.TOP_STATS.RANGES.LONG, icon: Calendar },
                                    { id: 'all_time', label: UI.PLAYLIST.TOP_STATS.RANGES.ALL_TIME, icon: BarChart3 }
                                ].map((opt) => (
                                    <button
                                        key={opt.id}
                                        onClick={() => setTerm(opt.id as 'short' | 'medium' | 'long' | 'all_time')}
                                        className={`p-4 rounded-xl border text-left transition-all flex flex-col items-start gap-2 ${term === opt.id
                                            ? 'bg-mint-500/20 border-mint-500 text-mint-400'
                                            : 'bg-neutral-800 border-transparent text-white/60 hover:bg-neutral-700'
                                            }`}
                                    >
                                        <opt.icon className="w-5 h-5 mb-1" />
                                        <span className="font-medium text-sm">{opt.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {(step === 'validating' || step === 'creating') && (
                    <div className="flex flex-col items-center justify-center py-12 text-center animate-fade-in">
                        <Loader2 className="w-12 h-12 text-mint-500 animate-spin mb-4" />
                        <p className="text-white/60">
                            {step === 'validating' ? UI.PLAYLIST.COMMON.STATUS.VALIDATING.STATS : UI.PLAYLIST.COMMON.STATUS.CREATING.STATS}
                        </p>
                    </div>
                )}

                {step === 'confirm' && validationData && (
                    <div className="space-y-4 animate-fade-in">
                        <div className="bg-mint-500/10 border border-mint-500/20 rounded-lg p-4 flex items-start gap-3">
                            <Check className="w-5 h-5 text-mint-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium text-mint-200">{UI.PLAYLIST.COMMON.STATUS.READY.STATS}</p>
                                <p className="text-sm text-mint-200/60">
                                    Found {validationData.trackCount} top tracks for this period.
                                </p>
                            </div>
                        </div>

                        {validationData.warnings.length > 0 && (
                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-sm text-yellow-200">
                                <p className="font-medium mb-1">Note:</p>
                                <ul className="list-disc list-inside opacity-80">
                                    {validationData.warnings.map((w, i) => <li key={i}>{w}</li>)}
                                </ul>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-white/60 mb-2">{UI.PLAYLIST.COMMON.LABELS.PLAYLIST_NAME}</label>
                            <input
                                type="text"
                                value={playlistName}
                                onChange={(e) => setPlaylistName(e.target.value)}
                                className="w-full bg-neutral-800 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-mint-500 outline-none"
                            />
                        </div>

                        {/* Cover Image Upload */}
                        <div>
                            <label className="block text-sm font-medium text-white/60 mb-2">
                                {UI.PLAYLIST.COMMON.LABELS.COVER_IMAGE} <span className="text-white/40">{UI.PLAYLIST.COMMON.LABELS.OPTIONAL_HINT}</span>
                            </label>
                            <input
                                type="file"
                                ref={fileInputRef}
                                accept="image/jpeg,image/png"
                                onChange={handleImageUpload}
                                className="hidden"
                            />
                            {coverPreview ? (
                                <div className="relative group inline-block">
                                    <img
                                        src={coverPreview}
                                        alt="Cover preview"
                                        className="w-24 h-24 rounded-lg object-cover"
                                    />
                                    <button
                                        onClick={() => { setCoverImage(null); setCoverPreview(null); }}
                                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X className="w-3 h-3 text-white" />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex items-center gap-3 px-4 py-3 rounded-lg bg-neutral-800 border border-white/10 hover:bg-neutral-700 transition-colors text-white/60 hover:text-white"
                                >
                                    <ImageIcon className="w-5 h-5" />
                                    <span className="text-sm">{UI.PLAYLIST.COMMON.LABELS.UPLOAD_COVER_BUTTON}</span>
                                </button>
                            )}
                            <p className="text-xs text-white/40 mt-2">{UI.PLAYLIST.COMMON.LABELS.IMAGE_REQUIREMENTS}</p>
                        </div>
                    </div>
                )}

                {step === 'success' && (
                    <div className="text-center py-12 animate-fade-in">
                        <div className="w-16 h-16 bg-mint-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Check className="w-8 h-8 text-mint-500" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">{UI.PLAYLIST.COMMON.STATUS.SUCCESS.TITLE.QUEUED}</h3>
                        <p className="text-white/60">
                            {UI.PLAYLIST.COMMON.STATUS.SUCCESS.DESCRIPTION.SOON}
                        </p>
                    </div>
                )}

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-center gap-3 animate-fade-in">
                        <AlertCircle className="w-5 h-5 text-red-500" />
                        <p className="text-sm text-red-200">{error}</p>
                    </div>
                )}
            </div>
        </SlidePanel>
    );
}

function ClockIcon(props: React.ComponentProps<'svg'>) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
        </svg>
    )
}
