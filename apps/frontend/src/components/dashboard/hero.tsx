"use client";

import { motion } from "framer-motion";
import { Play, Info } from "lucide-react";

interface HeroProps {
    title: string;
    subtitle: string;
    description: string;
    image: string;
}

export function Hero({ title, subtitle, description, image }: HeroProps) {
    return (
        <div className="relative h-[80vh] w-full flex items-center mb-12">
            {/* Background Image */}
            <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-60 mask-image-b"
                style={{ backgroundImage: `url(${image})` }}
            >
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
            </div>

            {/* Content */}
            <div className="relative z-10 px-8 md:px-16 container mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="max-w-2xl space-y-6"
                >
                    <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm text-primary font-medium">
                        {subtitle}
                    </div>

                    <h1 className="text-6xl md:text-8xl font-bold tracking-tighter text-white drop-shadow-2xl">
                        {title}
                    </h1>

                    <p className="text-lg md:text-xl text-gray-200 drop-shadow-md leading-relaxed">
                        {description}
                    </p>

                    <div className="flex items-center gap-4 pt-4">
                        <button className="flex items-center gap-2 bg-white text-black px-8 py-3 rounded-md font-bold hover:bg-gray-200 transition text-lg">
                            <Play className="fill-black w-6 h-6" /> Play History
                        </button>
                        <button className="flex items-center gap-2 bg-gray-500/30 backdrop-blur-sm text-white px-8 py-3 rounded-md font-bold hover:bg-gray-500/50 transition text-lg">
                            <Info className="w-6 h-6" /> More Info
                        </button>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
