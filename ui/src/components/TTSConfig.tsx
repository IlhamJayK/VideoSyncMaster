import React, { useState, useEffect } from 'react';

interface TTSConfigProps {
    themeMode?: 'light' | 'dark' | 'gradient';
}

const TTSConfig: React.FC<TTSConfigProps> = ({ themeMode }) => {
    const isLightMode = themeMode === 'gradient' || themeMode === 'light';
    const [refAudioPath, setRefAudioPath] = useState<string>('');
    const [temperature, setTemperature] = useState<number>(0.7);
    const [topP, setTopP] = useState<number>(0.8);
    const [repetitionPenalty, setRepetitionPenalty] = useState<number>(1.0);
    const [cfgScale, setCfgScale] = useState<number>(0.7);

    // Load config from localStorage
    useEffect(() => {
        const storedRef = localStorage.getItem('tts_ref_audio_path');
        if (storedRef) setRefAudioPath(storedRef);

        const storedTemp = localStorage.getItem('tts_temperature');
        if (storedTemp) setTemperature(parseFloat(storedTemp));

        const storedTopP = localStorage.getItem('tts_top_p');
        if (storedTopP) setTopP(parseFloat(storedTopP));

        const storedRepPen = localStorage.getItem('tts_repetition_penalty');
        if (storedRepPen) setRepetitionPenalty(parseFloat(storedRepPen));

        const storedCfg = localStorage.getItem('tts_cfg_scale');
        if (storedCfg) setCfgScale(parseFloat(storedCfg));

    }, []);

    const handleSave = () => {
        localStorage.setItem('tts_ref_audio_path', refAudioPath);
        localStorage.setItem('tts_temperature', temperature.toString());
        localStorage.setItem('tts_top_p', topP.toString());
        localStorage.setItem('tts_repetition_penalty', repetitionPenalty.toString());
        localStorage.setItem('tts_cfg_scale', cfgScale.toString());

        // You might want to show a toast or message here
        // For now, relies on user seeing the values persist
        alert('配置已保存！将在下次生成时生效。');
    };

    const handleReset = () => {
        if (window.confirm('确定要恢复默认配置吗？这将清除当前的所有TTS设置。')) {
            setRefAudioPath('');
            setTemperature(0.7);
            setTopP(0.8);
            setRepetitionPenalty(1.0);
            setCfgScale(0.7);

            localStorage.removeItem('tts_ref_audio_path');
            localStorage.removeItem('tts_temperature');
            localStorage.removeItem('tts_top_p');
            localStorage.removeItem('tts_repetition_penalty');
            localStorage.removeItem('tts_cfg_scale');

            // alert('已恢复默认配置！');
        }
    };

    const handleSelectFile = async () => {
        try {
            const result = await (window as any).ipcRenderer.invoke('dialog:openFile', {
                filters: [{ name: 'Audio Files', extensions: ['wav', 'mp3', 'flac', 'm4a'] }]
            });
            if (result && !result.canceled && result.filePaths.length > 0) {
                setRefAudioPath(result.filePaths[0]);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const SliderControl = ({ label, value, setValue, min, max, step, desc }: any) => (
        <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ fontWeight: 'bold' }}>{label}</label>
                <span style={{ fontWeight: 'bold', color: '#6366f1' }}>{value}</span>
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
            <h2 style={{ marginBottom: '20px', color: isLightMode ? '#000' : '#fff' }}>🗣️ TTS 语音合成配置</h2>

            <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px', background: isLightMode ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }}>
                <h3 style={{ marginTop: 0, marginBottom: '15px', color: isLightMode ? '#000' : '#fff' }}>基础设置</h3>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>参考音频 (Reference Audio)</label>
                    <p style={{ fontSize: '0.9em', color: isLightMode ? '#666' : '#aaa', marginBottom: '10px' }}>
                        用于由 AI 克隆音色的目标声音文件 (3-10秒 wav/mp3)。如果不指定，将使用默认音色。
                    </p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <input
                            type="text"
                            value={refAudioPath}
                            onChange={(e) => setRefAudioPath(e.target.value)}
                            placeholder="点击右侧按钮选择文件..."
                            style={{
                                flex: 1,
                                padding: '8px',
                                borderRadius: '4px',
                                border: '1px solid #ccc',
                                background: isLightMode ? '#fff' : 'rgba(0,0,0,0.2)',
                                color: isLightMode ? '#000' : '#fff'
                            }}
                        />
                        <button
                            onClick={handleSelectFile}
                            style={{
                                padding: '8px 16px',
                                background: '#6366f1',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            📂 选择文件
                        </button>
                    </div>
                </div>

                <div style={{ borderTop: isLightMode ? '1px solid #eee' : '1px solid #444', margin: '20px 0' }}></div>

                <h3 style={{ marginTop: 0, marginBottom: '15px', color: isLightMode ? '#000' : '#fff' }}>高级生成参数</h3>

                <SliderControl
                    label="Temperature (随机性/创造力)"
                    value={temperature}
                    setValue={setTemperature}
                    min={0.1} max={1.5} step={0.1}
                    desc="控制生成的随机性。较低的值生成更确定、保守的结果；较高的值(>0.8)更有创造力但可能不稳定。"
                />

                <SliderControl
                    label="Top P (采样范围)"
                    value={topP}
                    setValue={setTopP}
                    min={0.1} max={1.0} step={0.05}
                    desc="核采样概率。控制从概率最高的词汇中进行选择的范围。较低的值使语音更集中。"
                />

                <SliderControl
                    label="Repetition Penalty (重复惩罚)"
                    value={repetitionPenalty}
                    setValue={setRepetitionPenalty}
                    min={1.0} max={20.0} step={0.5}
                    desc="防止生成重复的内容。值越高，越倾向于避免重复。默认 1.0。"
                />

                <SliderControl
                    label="CFG Scale (Guidance Scale)"
                    value={cfgScale}
                    setValue={setCfgScale}
                    min={0.0} max={2.0} step={0.1}
                    desc="控制模型遵从输入条件的程度 (如参考音频)。值越高，越严格遵循条件，但可能降低自然度。"
                />

                <div style={{ marginTop: '20px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
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
        </div>
    );
};

export default TTSConfig;
