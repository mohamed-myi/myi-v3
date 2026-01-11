"use client";

import { motion } from "framer-motion";

interface PlaylistFeatureTileProps {
    icon: React.ElementType;
    title: string;
    description: string;
    onClick: () => void;
    gradient?: string;
}

export function PlaylistFeatureTile({ icon: Icon, title, description, onClick, gradient }: PlaylistFeatureTileProps) {
    return (
        <motion.button
            whileHover={{ scale: 1.02, y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className="group relative h-full w-full rounded-2xl glass p-8 text-left transition-all duration-300 hover:bg-white/10 hover:border-white/20 hover:shadow-2xl hover:shadow-mint-500/10 flex flex-col items-center text-center"
        >
            {/* Icon Container with Glow */}
            <div className={`mb-6 p-4 rounded-full bg-white/5 border border-white/10 group-hover:scale-110 transition-transform duration-300 ${gradient ? '' : 'text-mint-400'}`}>
                <Icon className={`w-10 h-10 ${gradient ? 'text-white' : ''}`} />
            </div>

            {/* Content */}
            <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-mint-300 transition-colors">
                {title}
            </h3>

            <p className="text-white/60 text-sm md:text-base leading-relaxed max-w-xs">
                {description}
            </p>

            {/* Hover Indicator */}
            <div className="mt-8 px-4 py-2 rounded-full border border-white/10 bg-white/5 text-xs font-medium text-white/40 group-hover:bg-mint-500/20 group-hover:text-mint-200 group-hover:border-mint-500/30 transition-all">
                Click to Create
            </div>
        </motion.button>
    );
}
