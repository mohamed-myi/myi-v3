"use client";

import { UI } from "@/constants/ui";
import { useState, useRef } from "react";
import { validateRecent, createRecentPlaylist } from "@/hooks/use-playlists";
import { SlidePanel } from "./slide-panel";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { AlertCircle, Check, Loader2, History, ImageIcon, X } from "lucide-react";

interface RecentModalProps {
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

export function RecentModal({ isOpen, onClose }: RecentModalProps) {
    const [step, setStep] = useState<'input' | 'validating' | 'confirm' | 'creating' | 'success'>('input');
    const [kValue, setKValue] = useState(100);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [playlistName, setPlaylistName] = useState("");
    const [coverImage, setCoverImage] = useState<string | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [validationData, setValidationData] = useState<ValidationData | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const { isDemo } = useDemoMode();

    const resetState = () => {
        setStep('input');
        setKValue(100);
        setStartDate("");
        setEndDate("");
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
            const data = await validateRecent(
                kValue,
                startDate || undefined,
                endDate || undefined
            );
            setValidationData(data);

            if (!playlistName) {
                if (startDate && endDate) {
                    const start = new Date(startDate).toLocaleDateString();
                    const end = new Date(endDate).toLocaleDateString();
                    setPlaylistName(`Tracks: ${start} - ${end}`);
                } else {
                    setPlaylistName(`Recent ${data.trackCount} Tracks`);
                }
            }

            setStep('confirm');
        } catch (err: unknown) {
            const apiError = err as ApiError;
            setError(apiError.response?.data?.error || "Failed to validate recent tracks");
            setStep('input');
        }
    };

    const handleCreate = async () => {
        if (!validationData || !playlistName) return;

        setStep('creating');
        setError(null);

        try {
            await createRecentPlaylist({
                kValue,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                isPublic: false,
                name: playlistName,
                description: `Created from recent tracks`,
                confirmationToken: validationData.confirmationToken,
                coverImageBase64: coverImage || undefined,
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
            title={UI.PLAYLIST.RECENT.TITLE}
            footer={renderFooter()}
        >
            {/* Feature Description */}
            <div className="mb-6 pb-6 border-b border-white/10">
                <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-mint-500/20">
                        <History className="w-5 h-5 text-mint-400" />
                    </div>
                    <span className="text-base font-medium text-white/90">{UI.PLAYLIST.RECENT.SUBTITLE}</span>
                </div>
                <p className="text-white/70 text-sm leading-relaxed">
                    {UI.PLAYLIST.RECENT.DESCRIPTION}
                </p>
            </div>

            <div className="space-y-6">
                {step === 'input' && (
                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <label className="text-sm font-medium text-white/80">{UI.PLAYLIST.RECENT.INPUT.TRACK_COUNT_LABEL}</label>
                                <span className="text-2xl font-bold text-mint-400">{kValue}</span>
                            </div>
                            <input
                                type="range"
                                min="25"
                                max="500"
                                step="25"
                                value={kValue}
                                onChange={(e) => setKValue(parseInt(e.target.value))}
                                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-mint-500"
                            />
                            <div className="flex justify-between text-xs text-white/40 mt-2">
                                <span>25</span>
                                <span>500</span>
                            </div>
                        </div>

                        {/* Date Range Picker */}
                        <div>
                            <label className="block text-sm font-medium text-white/80 mb-3">
                                {UI.PLAYLIST.RECENT.INPUT.DATE_RANGE_LABEL} <span className="text-white/40">{UI.PLAYLIST.COMMON.LABELS.OPTIONAL_HINT}</span>
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-white/40 mb-1">{UI.PLAYLIST.RECENT.INPUT.DATE_FROM_LABEL}</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        max={endDate || undefined}
                                        className="w-full bg-neutral-800 border border-white/10 rounded-lg p-3 text-white text-sm focus:ring-2 focus:ring-mint-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-white/40 mb-1">{UI.PLAYLIST.RECENT.INPUT.DATE_TO_LABEL}</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        min={startDate || undefined}
                                        max={new Date().toISOString().split('T')[0]}
                                        className="w-full bg-neutral-800 border border-white/10 rounded-lg p-3 text-white text-sm focus:ring-2 focus:ring-mint-500 outline-none"
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-white/40 mt-2">
                                {UI.PLAYLIST.RECENT.INPUT.DATE_HELPER}
                            </p>
                        </div>
                    </div>
                )}

                {(step === 'validating' || step === 'creating') && (
                    <div className="flex flex-col items-center justify-center py-12 text-center animate-fade-in">
                        <Loader2 className="w-12 h-12 text-mint-500 animate-spin mb-4" />
                        <p className="text-white/60">
                            {step === 'validating' ? UI.PLAYLIST.COMMON.STATUS.VALIDATING.RECENT : UI.PLAYLIST.COMMON.STATUS.CREATING.RECENT}
                        </p>
                    </div>
                )}

                {step === 'confirm' && validationData && (
                    <div className="space-y-4 animate-fade-in">
                        <div className="bg-mint-500/10 border border-mint-500/20 rounded-lg p-4 flex items-start gap-3">
                            <Check className="w-5 h-5 text-mint-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium text-mint-200">{UI.PLAYLIST.COMMON.STATUS.READY.RECENT}</p>
                                <p className="text-sm text-mint-200/60">
                                    We found {validationData.trackCount} unique tracks in your recent history.
                                </p>
                            </div>
                        </div>

                        {validationData.warnings.length > 0 && (
                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-sm text-yellow-200">
                                <p className="font-medium mb-1">Notice:</p>
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
                        <h3 className="text-xl font-bold text-white mb-2">{UI.PLAYLIST.COMMON.STATUS.SUCCESS.TITLE.SAVED}</h3>
                        <p className="text-white/60">
                            {UI.PLAYLIST.COMMON.STATUS.SUCCESS.DESCRIPTION.PERMANENT}
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
