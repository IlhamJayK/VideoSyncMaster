import React, { useState } from 'react';

interface SidebarProps {
    activeService: string;
    onServiceChange: (service: string) => void;
    disabled?: boolean;
    onOpenLog?: () => void;
    onRepairEnv?: () => void;
    onOpenModels?: () => void;
    hasMissingDeps?: boolean;
    themeMode?: 'light' | 'dark' | 'gradient'; // 'gradient' is actually our light mode now
}

const Sidebar: React.FC<SidebarProps> = ({ activeService, onServiceChange, disabled, onOpenLog, onRepairEnv, onOpenModels, hasMissingDeps, themeMode }) => {
    const [isHovered, setIsHovered] = useState(false);
    const isLightMode = themeMode === 'gradient'; // 'gradient' is the new Light Mode key

    const services = [
        { id: 'whisperx', name: '本地识别 (WhisperX)', icon: '💻' },
        { id: 'jianying', name: '刷个大火箭', icon: '🎬' },
        { id: 'bcut', name: '揣着硬币瞎晃悠', icon: '📺' },
    ];

    const configServices = [
        { id: 'strategy', name: '音画同步策略 ', icon: '🏃' },
        { id: 'tts', name: 'TTS 配置', icon: '🗣️' },
    ];

    return (
        <div
            className="glass-panel"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                width: isHovered ? '260px' : '80px',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                padding: '20px 0',
                marginRight: '20px',
                boxSizing: 'border-box',
                borderRight: isLightMode ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: '16px',
                backdropFilter: 'blur(20px)',
                backgroundColor: isLightMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(30, 41, 59, 0.6)',
                overflowY: 'auto',
                transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s',
                zIndex: 100
            }}
        >
            <div style={{
                marginBottom: '10px',
                borderBottom: isLightMode ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)',
                paddingBottom: '10px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                height: '52px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                textAlign: 'center'
            }}>
                {isHovered ? (
                    <div style={{ animation: 'fadeIn 0.3s' }}>
                        <h2 style={{ margin: 0, fontSize: '1.2em', color: isLightMode ? '#1e293b' : '#fff' }}>语音识别服务</h2>
                        <p style={{ margin: '5px 0 0 0', fontSize: '0.8em', color: isLightMode ? '#000000' : '#ffffff' }}>选择识别引擎</p>
                    </div>
                ) : (
                    <h2 style={{ margin: 0, fontSize: '1.8em', color: isLightMode ? '#7c3aed' : '#6366f1', fontWeight: 'bold', animation: 'fadeIn 0.3s' }}>VS</h2>
                )}
            </div>

            <style>{`
@keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
}
`}</style>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', flex: 1 }}>
                {services.map((service) => (
                    <button
                        key={service.id}
                        onClick={() => !disabled && onServiceChange(service.id)}
                        disabled={disabled}
                        title={!isHovered ? service.name : ''}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            // Fixed left padding to center icon in 80px width
                            // 80px width. Center is 40px. Icon is approx 32px.
                            // Padding left = 40 - 16 = 24px.
                            paddingLeft: '24px',
                            paddingRight: '12px',
                            paddingTop: '12px',
                            paddingBottom: '12px',
                            border: 'none',
                            borderLeft: activeService === service.id ? '4px solid var(--accent-color)' : '4px solid transparent',
                            background: activeService === service.id ? 'linear-gradient(90deg, rgba(99, 102, 241, 0.2), transparent)' : 'transparent',
                            color: activeService === service.id ? (isLightMode ? '#7c3aed' : '#fff') : (isLightMode ? '#475569' : '#cbd5e1'), // Dynamic Text Color
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.2s ease',
                            outline: 'none',
                            fontSize: '0.95em',
                            width: '100%',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            position: 'relative'
                        }}
                        onMouseEnter={(e) => {
                            if (!disabled && activeService !== service.id) {
                                e.currentTarget.style.background = isLightMode ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!disabled && activeService !== service.id) {
                                e.currentTarget.style.background = 'transparent';
                            }
                        }}
                    >
                        <span style={{ fontSize: '1.5em', marginRight: '15px', flexShrink: 0 }}>
                            {service.icon}
                        </span>
                        <span style={{
                            opacity: isHovered ? 1 : 0,
                            width: isHovered ? 'auto' : 0,
                            marginLeft: '12px',
                            transition: 'opacity 0.2s ease 0.1s',
                            display: 'inline-block'
                        }}>
                            {service.name}
                        </span>
                    </button>
                ))}

                <div style={{ margin: '10px 20px', borderBottom: isLightMode ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)' }}></div>

                {configServices.map((service) => (
                    <button
                        key={service.id}
                        onClick={() => !disabled && onServiceChange(service.id)}
                        disabled={disabled}
                        title={!isHovered ? service.name : ''}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            paddingLeft: '24px',
                            paddingRight: '12px',
                            paddingTop: '12px',
                            paddingBottom: '12px',
                            border: 'none',
                            borderLeft: activeService === service.id ? '4px solid var(--accent-color)' : '4px solid transparent',
                            background: activeService === service.id ? 'linear-gradient(90deg, rgba(99, 102, 241, 0.2), transparent)' : 'transparent',
                            color: activeService === service.id ? (isLightMode ? '#7c3aed' : '#fff') : (isLightMode ? '#475569' : '#cbd5e1'),
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.2s ease',
                            outline: 'none',
                            fontSize: '0.95em',
                            width: '100%',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            position: 'relative'
                        }}
                        onMouseEnter={(e) => {
                            if (!disabled && activeService !== service.id) {
                                e.currentTarget.style.background = isLightMode ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!disabled && activeService !== service.id) {
                                e.currentTarget.style.background = 'transparent';
                            }
                        }}
                    >
                        <span style={{ fontSize: '1.5em', marginRight: '15px', flexShrink: 0 }}>{service.icon}</span>
                        <span style={{ opacity: isHovered ? 1 : 0, transition: 'opacity 0.2s', width: isHovered ? 'auto' : 0, marginLeft: '12px', display: 'inline-block' }}>{service.name}</span>
                    </button>
                ))}
            </div>

            {/* Bottom Section: Utilities */}
            <div style={{
                marginTop: 'auto',
                borderTop: isLightMode ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)',
                paddingTop: '10px',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px'
            }}>
                <button
                    onClick={onOpenModels}
                    title={!isHovered ? "模型管理中心" : ""}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: '24px',
                        paddingRight: '12px',
                        paddingTop: '12px',
                        paddingBottom: '12px',
                        border: 'none',
                        borderLeft: activeService === 'models' ? '4px solid var(--accent-color)' : '4px solid transparent',
                        background: activeService === 'models' ? 'linear-gradient(90deg, rgba(99, 102, 241, 0.2), transparent)' : 'transparent',
                        color: activeService === 'models' ? (isLightMode ? '#7c3aed' : '#fff') : (isLightMode ? '#64748b' : '#94a3b8'),
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.2s ease',
                        outline: 'none',
                        fontSize: '0.95em',
                        width: '100%',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        position: 'relative'
                    }}
                    onMouseEnter={(e) => {
                        if (activeService !== 'models') {
                            e.currentTarget.style.color = isLightMode ? '#1e293b' : '#fff';
                            e.currentTarget.style.background = isLightMode ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (activeService !== 'models') {
                            e.currentTarget.style.color = isLightMode ? '#64748b' : '#94a3b8';
                            e.currentTarget.style.background = 'transparent';
                        }
                    }}
                >
                    <span style={{ fontSize: '1.5em', marginRight: '15px', flexShrink: 0 }}>📦</span>
                    <span style={{
                        opacity: isHovered ? 1 : 0,
                        transition: 'opacity 0.2s',
                        transitionDelay: isHovered ? '0.1s' : '0s'
                    }}>
                        模型管理中心
                    </span>
                </button>

                <button
                    onClick={onRepairEnv}
                    title={!isHovered ? "修复运行环境" : ""}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: '24px',
                        paddingRight: '12px',
                        paddingTop: '12px',
                        paddingBottom: '12px',
                        border: 'none',
                        borderLeft: '4px solid transparent',
                        background: 'transparent',
                        color: isLightMode ? '#64748b' : '#94a3b8',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.2s ease',
                        outline: 'none',
                        fontSize: '0.95em',
                        width: '100%',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        position: 'relative'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = isLightMode ? '#1e293b' : '#fff';
                        e.currentTarget.style.background = isLightMode ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = isLightMode ? '#64748b' : '#94a3b8';
                        e.currentTarget.style.background = 'transparent';
                    }}
                >
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <span style={{ fontSize: '1.5em', marginRight: '15px', flexShrink: 0 }}>🔧</span>
                        {hasMissingDeps && (
                            <span style={{
                                position: 'absolute',
                                top: '-2px',
                                right: '12px',
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: '#ef4444',
                                border: `2px solid ${isLightMode ? '#ffffff' : '#1e293b'}`
                            }} />
                        )}
                    </div>
                    <span style={{
                        opacity: isHovered ? 1 : 0,
                        transition: 'opacity 0.2s',
                        transitionDelay: isHovered ? '0.1s' : '0s'
                    }}>
                        修复运行环境
                    </span>
                </button>

                <button
                    onClick={onOpenLog}
                    title={!isHovered ? "查看运行日志" : ""}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: '24px', // Align with other icons
                        paddingRight: '12px',
                        paddingTop: '12px',
                        paddingBottom: '12px',
                        border: 'none',
                        borderLeft: '4px solid transparent',
                        background: 'transparent',
                        color: isLightMode ? '#64748b' : '#94a3b8',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.2s ease',
                        outline: 'none',
                        fontSize: '0.95em',
                        width: '100%',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        position: 'relative'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = isLightMode ? '#1e293b' : '#fff';
                        e.currentTarget.style.background = isLightMode ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = isLightMode ? '#64748b' : '#94a3b8';
                        e.currentTarget.style.background = 'transparent';
                    }}
                >
                    <span style={{ fontSize: '1.5em', marginRight: '15px', flexShrink: 0 }}>📝</span>
                    <span style={{
                        opacity: isHovered ? 1 : 0,
                        transition: 'opacity 0.2s',
                        transitionDelay: isHovered ? '0.1s' : '0s'
                    }}>
                        查看运行日志
                    </span>
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
