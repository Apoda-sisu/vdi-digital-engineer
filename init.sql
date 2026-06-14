-- VDI 数字工程师数据库初始化脚本

-- 创建扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 创建事件表
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id VARCHAR(100) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    producer VARCHAR(50) NOT NULL,
    project_id VARCHAR(100) NOT NULL,
    schema_version VARCHAR(20) DEFAULT '2.0.0',
    trace_id VARCHAR(100),
    payload JSONB NOT NULL,
    subscribers TEXT[],
    acknowledged_by TEXT[],
    status VARCHAR(20) DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE
);

-- 创建事件索引
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_producer ON events(producer);
CREATE INDEX IF NOT EXISTS idx_events_project_id ON events(project_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);

-- 创建提资表
CREATE TABLE IF NOT EXISTS handoffs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    handoff_id VARCHAR(100) UNIQUE NOT NULL,
    source_discipline VARCHAR(50) NOT NULL,
    target_discipline TEXT[] NOT NULL,
    handoff_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    data JSONB NOT NULL,
    acknowledgments JSONB DEFAULT '[]',
    rejection_reason JSONB,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP WITH TIME ZONE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- 创建提资索引
CREATE INDEX IF NOT EXISTS idx_handoffs_source ON handoffs(source_discipline);
CREATE INDEX IF NOT EXISTS idx_handoffs_status ON handoffs(status);
CREATE INDEX IF NOT EXISTS idx_handoffs_created_at ON handoffs(created_at);

-- 创建知识库条文表
CREATE TABLE IF NOT EXISTS knowledge_clauses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clause_id VARCHAR(100) UNIQUE NOT NULL,
    standard VARCHAR(100) NOT NULL,
    title VARCHAR(200),
    clause VARCHAR(50),
    content TEXT NOT NULL,
    discipline VARCHAR(50),
    category VARCHAR(100),
    mandatory BOOLEAN DEFAULT false,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建知识库索引
CREATE INDEX IF NOT EXISTS idx_clauses_discipline ON knowledge_clauses(discipline);
CREATE INDEX IF NOT EXISTS idx_clauses_category ON knowledge_clauses(category);
CREATE INDEX IF NOT EXISTS idx_clauses_standard ON knowledge_clauses(standard);
CREATE INDEX IF NOT EXISTS idx_clauses_content ON knowledge_clauses USING gin(content gin_trgm_ops);

-- 创建公式表
CREATE TABLE IF NOT EXISTS formulas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    formula_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    name_en VARCHAR(200),
    discipline VARCHAR(50) NOT NULL,
    category VARCHAR(100),
    type VARCHAR(50),
    equation_text TEXT,
    equation_latex TEXT,
    equation_ast JSONB,
    variables JSONB,
    source JSONB,
    tags TEXT[],
    keywords TEXT[],
    precision DECIMAL(10,4),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1
);

-- 创建公式索引
CREATE INDEX IF NOT EXISTS idx_formulas_discipline ON formulas(discipline);
CREATE INDEX IF NOT EXISTS idx_formulas_category ON formulas(category);
CREATE INDEX IF NOT EXISTS idx_formulas_type ON formulas(type);
CREATE INDEX IF NOT EXISTS idx_formulas_name ON formulas USING gin(name gin_trgm_ops);

-- 创建项目表
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'active',
    disciplines TEXT[],
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(100) UNIQUE NOT NULL,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(200),
    role VARCHAR(50) DEFAULT 'user',
    discipline VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- 创建审计日志表
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(100),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建审计日志索引
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);

-- 创建函数：更新 updated_at 字段
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 创建触发器
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_handoffs_updated_at BEFORE UPDATE ON handoffs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_clauses_updated_at BEFORE UPDATE ON knowledge_clauses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_formulas_updated_at BEFORE UPDATE ON formulas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 插入默认管理员用户
INSERT INTO users (user_id, username, email, role, discipline)
VALUES ('admin', '系统管理员', 'admin@vdi.com', 'admin', 'system')
ON CONFLICT (user_id) DO NOTHING;

-- 插入默认项目
INSERT INTO projects (project_id, name, description, disciplines)
VALUES (
    'VDI-PILOT-B',
    'VDI 试点项目 B',
    'VDI 数字工程师试点项目，用于验证系统功能和性能',
    ARRAY['PR', 'PI', 'IN', 'EL', 'EQ', 'WA', 'HS', 'ST', 'AR', 'MA']
)
ON CONFLICT (project_id) DO NOTHING;

-- 创建视图：事件统计
CREATE OR REPLACE VIEW event_stats AS
SELECT
    event_type,
    producer,
    status,
    COUNT(*) as count,
    MIN(created_at) as first_event,
    MAX(created_at) as last_event
FROM events
GROUP BY event_type, producer, status;

-- 创建视图：提资统计
CREATE OR REPLACE VIEW handoff_stats AS
SELECT
    source_discipline,
    handoff_type,
    status,
    COUNT(*) as count,
    MIN(created_at) as first_handoff,
    MAX(created_at) as last_handoff
FROM handoffs
GROUP BY source_discipline, handoff_type, status;

-- 创建视图：知识库统计
CREATE OR REPLACE VIEW knowledge_stats AS
SELECT
    discipline,
    category,
    mandatory,
    COUNT(*) as count
FROM knowledge_clauses
GROUP BY discipline, category, mandatory;

-- 创建视图：公式统计
CREATE OR REPLACE VIEW formula_stats AS
SELECT
    discipline,
    category,
    type,
    COUNT(*) as count
FROM formulas
GROUP BY discipline, category, type;

-- 授予权限
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO vdi_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO vdi_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO vdi_user;