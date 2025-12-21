'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';
import { api } from '@/lib/api';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export function DailyDoseChart() {
    const { data, isLoading } = useSWR('/me/stats/activity', fetcher);

    const chartData = useMemo(() => {
        if (!data || !data.hourly) return [];
        const fullDay = Array.from({ length: 24 }, (_, i) => {
            const hourStat = data.hourly.find((h: { hour: number; playCount: number }) => h.hour === i);
            return {
                hour: i,
                label: i === 0 ? '12 AM' : i === 12 ? '12 PM' : i > 12 ? `${i - 12} PM` : `${i} AM`,
                count: hourStat ? hourStat.playCount : 0
            };
        });
        return fullDay;
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
                <h3 className="text-xl font-semibold bg-gradient-to-r from-teal-400 to-emerald-500 bg-clip-text text-transparent">
                    Daily Dose
                </h3>
                <p className="text-white/50 text-sm mt-1">
                    Your 24-hour listening rhythm.
                </p>
            </div>

            {/* Chart */}
            <div className="p-6">
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
                            <PolarGrid stroke="rgba(255, 255, 255, 0.1)" />
                            <PolarAngleAxis
                                dataKey="label"
                                tick={{ fill: 'rgba(255, 255, 255, 0.4)', fontSize: 10 }}
                            />
                            <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={false} axisLine={false} />
                            <Radar
                                name="Plays"
                                dataKey="count"
                                stroke="#10b981"
                                strokeWidth={2}
                                fill="#10b981"
                                fillOpacity={0.3}
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
                        </RadarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
