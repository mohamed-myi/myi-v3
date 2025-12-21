'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export function MoodChart() {
    const { data, isLoading } = useSWR('/me/stats/mood', fetcher);

    const chartData = useMemo(() => {
        if (!data) return [];
        return data.map((d: { date: string; valence: number; energy: number }) => ({
            date: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            valence: Math.round(d.valence * 100),
            energy: Math.round(d.energy * 100),
        }));
    }, [data]);

    if (isLoading) {
        return (
            <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="h-[350px] w-full animate-pulse bg-white/5 rounded-xl" />
            </div>
        );
    }

    return (
        <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-white/10">
                <h3 className="text-xl font-semibold bg-gradient-to-r from-yellow-400 to-purple-500 bg-clip-text text-transparent">
                    Mood Model
                </h3>
                <p className="text-white/50 text-sm mt-1">
                    Your music&apos;s emotional timeline over the last 30 days.
                </p>
            </div>

            {/* Chart */}
            <div className="p-6">
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorValence" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorEnergy" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis
                                dataKey="date"
                                stroke="#525252"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={30}
                            />
                            <YAxis
                                stroke="#525252"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `${value}%`}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                    backdropFilter: 'blur(12px)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '12px',
                                    color: '#fff'
                                }}
                                itemStyle={{ color: '#fff' }}
                            />
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" vertical={false} />
                            <Area
                                type="monotone"
                                dataKey="valence"
                                name="Happiness"
                                stroke="#eab308"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorValence)"
                            />
                            <Area
                                type="monotone"
                                dataKey="energy"
                                name="Energy"
                                stroke="#a855f7"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorEnergy)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-6 mt-4 pt-4 border-t border-white/10">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-yellow-500" />
                        <span className="text-sm text-white/60">Happiness</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-purple-500" />
                        <span className="text-sm text-white/60">Energy</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
