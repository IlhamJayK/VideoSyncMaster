import React, { useState, useEffect } from 'react';

interface WhisperConfigProps {
    themeMode?: 'light' | 'dark' | 'gradient';
}

const WhisperConfig: React.FC<WhisperConfigProps> = ({ themeMode }) => {
    const isLightMode = themeMode === 'gradient' || themeMode === 'light';

    // Default values matching backend defaults
    const [vadOnset, setVadOnset] = useState<number>(0.700);
    const [vadOffset, setVadOffset] = useState<number>(0.700);

    // Load config from localStorage
    useEffect(() => {
        const storedOnset = localStorage.getItem('whisper_vad_onset');
        if (storedOnset) setVadOnset(parseFloat(storedOnset));

        const storedOffset = localStorage.getItem('whisper_vad_offset');
        if (storedOffset) setVadOffset(parseFloat(storedOffset));
    }, []);

    const handleSave = () => {
        localStorage.setItem('whisper_vad_onset', vadOnset.toString());
        localStorage.setItem('whisper_vad_offset', vadOffset.toString());
        alert('Whisper VAD 配置已保存！将在下次运行时生效。');
    };

    const handleReset = () => {
        if (window.confirm('确定要恢复默认配置吗？')) {
            setVadOnset(0.700);
            setVadOffset(0.700);
            localStorage.removeItem('whisper_vad_onset');
            localStorage.removeItem('whisper_vad_offset');
        }
    };

    const SliderControl = ({ label, value, setValue, min, max, step, desc }: any) => (
        <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ fontWeight: 'bold' }}>{label}</label>
                <span style={{ fontWeight: 'bold', color: '#6366f1' }}>{value.toFixed(3)}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => setValue(parseFloat(e.target.value))}
                style={{ width: '100%', cursor: 'pointer' }}
            />
            {desc && <p style={{ fontSize: '0.8em', color: isLightMode ? '#666' : '#aaa', margin: '5px 0 0 0' }}>{desc}</p>}
        </div>
    );

    return (
        <div style={{ padding: '20px', height: '100%', overflowY: 'auto', color: isLightMode ? '#333' : '#fff' }}>
            <h2 style={{ marginBottom: '20px', color: isLightMode ? '#000' : '#fff' }}>🎙️ Whisper VAD 配置</h2>

            <p style={{ marginBottom: '20px', fontSize: '0.9em', color: isLightMode ? '#666' : '#aaa' }}>
                调整语音活动检测（VAD）的灵敏度。这些设置决定了 Whisper 如何在音频中分割语音和静音。
            </p>

            <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px', background: isLightMode ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }}>
                <SliderControl
                    label="VAD Onset (开始阈值)"
                    value={vadOnset}
                    setValue={setVadOnset}
                    min={0.1}
                    max={1.0}
                    step={0.001}
                    desc="语音开始的检测阈值。值越高，越难触发语音识别（包括更多的静音）；值越低，越敏感（可能误识别噪音）。默认 0.700。"
                />
                <SliderControl
                    label="VAD Offset (结束阈值)"
                    value={vadOffset}
                    setValue={setVadOffset}
                    min={0.1}
                    max={1.0}
                    step={0.001}
                    desc="语音结束的检测阈值。值越高，语音断句越快（切断尾音）；值越低，保留更多尾部静音。默认 0.700。"
                />
            </div>

            <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                    onClick={handleReset}
                    style={{
                        padding: '10px 24px',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                    }}
                >
                    ↺ 恢复默认
                </button>
                <button
                    onClick={handleSave}
                    style={{
                        padding: '10px 24px',
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                    }}
                >
                    💾 保存配置
                </button>
            </div>
        </div>
    );
};

export default WhisperConfig;
