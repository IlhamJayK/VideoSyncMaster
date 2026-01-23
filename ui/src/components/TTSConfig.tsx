
import React, { useState, useEffect } from 'react';
import QwenTTSConfig from './QwenTTSConfig';
import ConfirmDialog from './ConfirmDialog';

interface TTSConfigProps {
    themeMode?: 'light' | 'dark' | 'gradient';
    activeService: 'indextts' | 'qwen';
    onServiceChange: (service: 'indextts' | 'qwen') => void;
    onQwenModeChange: (mode: 'clone' | 'design' | 'preset') => void;
}

const TTSConfig: React.FC<TTSConfigProps> = ({ themeMode, activeService, onServiceChange, onQwenModeChange }) => {
    const isLightMode = themeMode === 'gradient' || themeMode === 'light';

    // IndexTTS States
    const [refAudioPath, setRefAudioPath] = useState<string>('');
    const [temperature, setTemperature] = useState<number>(0.7);
    const [topP, setTopP] = useState<number>(0.8);
    const [repetitionPenalty, setRepetitionPenalty] = useState<number>(1.0);
    const [cfgScale, setCfgScale] = useState<number>(0.7);

    // Switching State
    const [switching, setSwitching] = useState(false);
    const [switchStatus, setSwitchStatus] = useState('');

    // Dialog State
    const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
    const [feedback, setFeedback] = useState<{ title: string; message: string; type: 'success' | 'error' } | null>(null);

    // View State (Separate from Active Service)
    const [viewMode, setViewMode] = useState<'indextts' | 'qwen'>(() => {
        return (localStorage.getItem('last_tts_view') as any) || activeService || 'indextts';
    });

    // Load IndexTTS config
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

        if (activeService) {
            // If we just mounted, ensuring viewMode syncs if desired not strictly needed if we use localStorage
        }
    }, []);

    // Save view mode
    useEffect(() => {
        localStorage.setItem('last_tts_view', viewMode);
    }, [viewMode]);

    const handleSaveIndex = () => {
        localStorage.setItem('tts_ref_audio_path', refAudioPath);
        localStorage.setItem('tts_temperature', temperature.toString());
        localStorage.setItem('tts_top_p', topP.toString());
        localStorage.setItem('tts_repetition_penalty', repetitionPenalty.toString());
        localStorage.setItem('tts_cfg_scale', cfgScale.toString());
        setFeedback({ title: '保存成功', message: 'IndexTTS 配置已保存！', type: 'success' });
    };

    const confirmResetIndex = () => {
        setRefAudioPath('');
        setTemperature(0.7);
        setTopP(0.8);
        setRepetitionPenalty(1.0);
        setCfgScale(0.7);
        localStorage.removeItem('tts_ref_audio_path');
        // also reset other keys if needed? 
        // For now just ref audio is the main one persisted separately
        setIsResetDialogOpen(false);
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

    const handleSwitchService = async (target: 'indextts' | 'qwen') => {
        if (target === activeService) return;

        // No need for native confirm. The global overlay in App.tsx will show if deps are installing.
        setSwitching(true);
        setSwitchStatus('正在配置环境...');

        try {

            await (window as any).ipcRenderer.invoke('run-backend', [
                '--action', 'generate_single_tts',
                '--tts_service', target,
                '--input', 'dummy', '--output', 'dummy', '--text', 'dummy'
            ]);

            // The backend will try to init, install deps, then maybe fail on dummy file.
            // But deps will be installed.

            onServiceChange(target);
            setSwitchStatus('');
            setSwitching(false);
            // No alert needed, UI update is enough feedback.

        } catch (e) {
            console.error(e);
            setSwitchStatus('切换失败');
            setSwitching(false);
            setFeedback({ title: '切换失败', message: '切换环境失败，请查看日志。', type: 'error' });
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

            <ConfirmDialog
                isOpen={isResetDialogOpen}
                title="重置配置"
                message="确定要重置所有 Index-TTS 配置参数吗？此操作无法撤销。"
                onConfirm={confirmResetIndex}
                onCancel={() => setIsResetDialogOpen(false)}
                isLightMode={isLightMode}
                confirmColor="#ef4444"
                confirmText="确定重置"
            />

            <ConfirmDialog
                isOpen={!!feedback}
                title={feedback?.title || ''}
                message={feedback?.message || ''}
                onConfirm={() => setFeedback(null)}
                isLightMode={isLightMode}
                confirmColor={feedback?.type === 'success' ? '#10b981' : '#ef4444'}
                confirmText={feedback?.type === 'success' ? '好' : '我知道了'}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, color: isLightMode ? '#000' : '#fff' }}>
                    🗣️ {viewMode === 'qwen' ? 'Qwen3-TTS' : 'Index-TTS'} 配置
                </h2>

                <div style={{ background: isLightMode ? '#eee' : '#333', borderRadius: '20px', padding: '4px', display: 'flex' }}>
                    <button
                        onClick={() => setViewMode('indextts')}
                        style={{
                            background: viewMode === 'indextts' ? '#6366f1' : 'transparent',
                            color: viewMode === 'indextts' ? '#fff' : (isLightMode ? '#666' : '#aaa'),
                            border: 'none',
                            borderRadius: '16px',
                            padding: '6px 16px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            transition: 'all 0.2s',
                            display: 'flex', alignItems: 'center', gap: '5px'
                        }}
                    >
                        {activeService === 'indextts' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 5px #22c55e' }}></span>} Index-TTS
                    </button>
                    <button
                        onClick={() => setViewMode('qwen')}
                        style={{
                            background: viewMode === 'qwen' ? '#6366f1' : 'transparent',
                            color: viewMode === 'qwen' ? '#fff' : (isLightMode ? '#666' : '#aaa'),
                            border: 'none',
                            borderRadius: '16px',
                            padding: '6px 16px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            transition: 'all 0.2s',
                            display: 'flex', alignItems: 'center', gap: '5px'
                        }}
                    >
                        {activeService === 'qwen' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 5px #22c55e' }}></span>} Qwen3-TTS
                    </button>
                </div>
            </div>

            {switching && (
                <div style={{ padding: '20px', background: 'rgba(255, 165, 0, 0.2)', borderRadius: '8px', marginBottom: '20px', textAlign: 'center' }}>
                    <div className="spinner" style={{ display: 'inline-block', width: '20px', height: '20px', border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite', marginRight: '10px' }}></div>
                    {switchStatus}
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            )}

            <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px', background: isLightMode ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }}>

                {viewMode === 'qwen' ? (
                    <QwenTTSConfig
                        themeMode={themeMode}
                        isActive={activeService === 'qwen'}
                        onActivate={() => handleSwitchService('qwen')}
                        onModeChange={onQwenModeChange}
                    />
                ) : (
                    <>
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
                                        background: '#3b82f6',
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
                            label="Temperature (随机性)"
                            value={temperature}
                            setValue={setTemperature}
                            min={0.1} max={1.5} step={0.1}
                        />

                        <SliderControl
                            label="Top P (采样范围)"
                            value={topP}
                            setValue={setTopP}
                            min={0.1} max={1.0} step={0.05}
                        />

                        <SliderControl
                            label="Repetition Penalty"
                            value={repetitionPenalty}
                            setValue={setRepetitionPenalty}
                            min={1.0} max={20.0} step={0.5}
                        />

                        <SliderControl
                            label="CFG Scale"
                            value={cfgScale}
                            setValue={setCfgScale}
                            min={0.0} max={2.0} step={0.1}
                        />

                        <div style={{ marginTop: '20px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '10px', alignItems: 'center' }}>
                            <button
                                onClick={() => handleSwitchService('indextts')}
                                disabled={activeService === 'indextts'}
                                style={{
                                    padding: '10px 24px',
                                    background: activeService === 'indextts' ? '#4b5563' : '#3b82f6',
                                    color: 'white',
                                    borderRadius: '4px',
                                    cursor: activeService === 'indextts' ? 'default' : 'pointer',
                                    fontWeight: 'bold',
                                    opacity: activeService === 'indextts' ? 1 : 0.8,
                                    boxShadow: activeService === 'indextts' ? '0 0 10px #22c55e' : 'none',
                                    border: activeService === 'indextts' ? '2px solid #22c55e' : 'none'
                                }}
                            >
                                {activeService === 'indextts' ? '✅ 当前已激活' : '⚡ 启用此配置'}
                            </button>
                            <button
                                onClick={() => setIsResetDialogOpen(true)}
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
                                onClick={handleSaveIndex}
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
                    </>
                )}
            </div>
        </div>
    );
};

export default TTSConfig;

