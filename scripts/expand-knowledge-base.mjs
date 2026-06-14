#!/usr/bin/env node
/**
 * 扩展知识库脚本
 * 添加更多规范条文
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "pilotdeck-vdi/data");
const V2_PATH = path.join(DATA_DIR, "knowledge-clauses-v2.json");

// 读取现有知识库
const knowledge = JSON.parse(fs.readFileSync(V2_PATH, "utf8"));

// 新增的规范条文
const newClauses = [
  // 工艺专业规范
  {
    "clause_id": "GB50160-2008-5.2.1",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "5.2.1",
    "content": "设备、建筑物平面布置的防火间距，应满足本标准附录A的规定。",
    "discipline": "process",
    "category": "防火间距",
    "mandatory": true,
    "tags": ["防火间距", "平面布置", "安全"]
  },
  {
    "clause_id": "GB50160-2008-5.2.2",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "5.2.2",
    "content": "装置内设备、建筑物、构筑物的平面布置的防火间距，应满足本标准附录B的规定。",
    "discipline": "process",
    "category": "防火间距",
    "mandatory": true,
    "tags": ["防火间距", "装置布置", "安全"]
  },
  {
    "clause_id": "GB50160-2008-5.2.3",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "5.2.3",
    "content": "液化烃、可燃液体储罐的防火间距，应满足本标准附录C的规定。",
    "discipline": "process",
    "category": "储罐防火",
    "mandatory": true,
    "tags": ["储罐", "液化烃", "防火间距"]
  },
  {
    "clause_id": "GB50016-2014-3.1.1",
    "standard": "GB 50016-2014",
    "title": "建筑设计防火规范",
    "clause": "3.1.1",
    "content": "生产的火灾危险性应根据生产中使用或产生的物质性质及其数量等因素划分，可分为甲、乙、丙、丁、戊类。",
    "discipline": "process",
    "category": "火灾危险性",
    "mandatory": true,
    "tags": ["火灾危险性", "生产分类", "安全"]
  },
  {
    "clause_id": "GB50016-2014-3.1.2",
    "standard": "GB 50016-2014",
    "title": "建筑设计防火规范",
    "clause": "3.1.2",
    "content": "同一座厂房或厂房的任一防火分区内有不同火灾危险性生产时，厂房或防火分区内的生产火灾危险性类别应按火灾危险性较大的部分确定。",
    "discipline": "process",
    "category": "火灾危险性",
    "mandatory": true,
    "tags": ["火灾危险性", "防火分区", "厂房"]
  },
  {
    "clause_id": "GB50160-2008-4.1.1",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "4.1.1",
    "content": "石油化工企业的总平面布置，应根据企业的生产流程及各组成部分的生产特点和火灾危险性，结合地形、风向等条件，按功能分区集中布置。",
    "discipline": "process",
    "category": "总平面布置",
    "mandatory": true,
    "tags": ["总平面布置", "功能分区", "生产流程"]
  },
  {
    "clause_id": "GB50160-2008-4.1.2",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "4.1.2",
    "content": "可能散发可燃气体的工艺装置、罐组、装卸区或全厂性污水处理场等设施，宜布置在人员集中场所及明火或散发火花地点的全年最小频率风向的上风侧。",
    "discipline": "process",
    "category": "总平面布置",
    "mandatory": true,
    "tags": ["风向", "可燃气体", "安全距离"]
  },
  {
    "clause_id": "GB50160-2008-4.1.3",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "4.1.3",
    "content": "厂区主要出入口不宜少于两个，并宜位于不同方位。",
    "discipline": "process",
    "category": "总平面布置",
    "mandatory": true,
    "tags": ["厂区出入口", "安全疏散", "总平面"]
  },
  {
    "clause_id": "GB50160-2008-5.1.1",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "5.1.1",
    "content": "装置内设备、建筑物、构筑物的平面布置，应根据装置的生产流程、火灾危险性、操作条件、设备检修、环境保护和职业安全卫生等因素综合确定。",
    "discipline": "process",
    "category": "装置布置",
    "mandatory": true,
    "tags": ["装置布置", "生产流程", "安全"]
  },
  {
    "clause_id": "GB50160-2008-5.1.2",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "5.1.2",
    "content": "装置内设备、建筑物、构筑物的平面布置，应有利于防止可燃气体、液化烃和可燃液体的泄漏和扩散。",
    "discipline": "process",
    "category": "装置布置",
    "mandatory": true,
    "tags": ["装置布置", "泄漏防护", "安全"]
  },
  {
    "clause_id": "GB50160-2008-6.1.1",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "6.1.1",
    "content": "工艺管道的设计压力，应按下列规定确定：1.不得低于在正常操作条件下可能产生的最高压力；2.不得低于安全阀的定压。",
    "discipline": "process",
    "category": "工艺管道",
    "mandatory": true,
    "tags": ["设计压力", "工艺管道", "安全阀"]
  },
  {
    "clause_id": "GB50160-2008-6.1.2",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "6.1.2",
    "content": "工艺管道的设计温度，应按下列规定确定：1.不得低于在正常操作条件下可能达到的最高温度；2.不得高于在正常操作条件下可能达到的最低温度。",
    "discipline": "process",
    "category": "工艺管道",
    "mandatory": true,
    "tags": ["设计温度", "工艺管道", "温度范围"]
  },
  {
    "clause_id": "GB50160-2008-7.1.1",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "7.1.1",
    "content": "可燃气体、液化烃和可燃液体的储罐，应采用钢制储罐。",
    "discipline": "process",
    "category": "储罐设计",
    "mandatory": true,
    "tags": ["储罐", "钢制储罐", "可燃气体"]
  },
  {
    "clause_id": "GB50160-2008-7.1.2",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "7.1.2",
    "content": "储罐的基础，应根据储罐的类型、容量、地基条件和当地抗震设防烈度等因素确定。",
    "discipline": "process",
    "category": "储罐设计",
    "mandatory": true,
    "tags": ["储罐基础", "地基条件", "抗震"]
  },
  {
    "clause_id": "GB50160-2008-8.1.1",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "8.1.1",
    "content": "石油化工企业的消防给水系统，应与生产、生活给水系统分开设置。",
    "discipline": "process",
    "category": "消防给水",
    "mandatory": true,
    "tags": ["消防给水", "给水系统", "安全"]
  },
  {
    "clause_id": "GB50160-2008-8.1.2",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "8.1.2",
    "content": "消防给水系统的设计，应满足消防用水量和水压的要求。",
    "discipline": "process",
    "category": "消防给水",
    "mandatory": true,
    "tags": ["消防给水", "用水量", "水压"]
  },
  {
    "clause_id": "GB50160-2008-9.1.1",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "9.1.1",
    "content": "石油化工企业的防雷设计，应符合现行国家标准《建筑物防雷设计规范》GB 50057的有关规定。",
    "discipline": "process",
    "category": "防雷设计",
    "mandatory": true,
    "tags": ["防雷", "防雷设计", "安全"]
  },
  {
    "clause_id": "GB50160-2008-9.1.2",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "9.1.2",
    "content": "石油化工企业的防静电设计，应符合现行国家标准《石油化工静电接地设计规范》SH 3097的有关规定。",
    "discipline": "process",
    "category": "防静电",
    "mandatory": true,
    "tags": ["防静电", "静电接地", "安全"]
  },
  {
    "clause_id": "GB50160-2008-10.1.1",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "10.1.1",
    "content": "石油化工企业的灭火器配置，应符合现行国家标准《建筑灭火器配置设计规范》GB 50140的有关规定。",
    "discipline": "process",
    "category": "灭火器配置",
    "mandatory": true,
    "tags": ["灭火器", "消防", "安全"]
  },
  {
    "clause_id": "GB50160-2008-10.1.2",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "10.1.2",
    "content": "甲、乙类装置或厂房内，应设置灭火器。",
    "discipline": "process",
    "category": "灭火器配置",
    "mandatory": true,
    "tags": ["灭火器", "甲乙类", "装置"]
  },
  {
    "clause_id": "GB50160-2008-11.1.1",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "11.1.1",
    "content": "石油化工企业的火灾自动报警系统，应符合现行国家标准《火灾自动报警系统设计规范》GB 50116的有关规定。",
    "discipline": "process",
    "category": "火灾报警",
    "mandatory": true,
    "tags": ["火灾报警", "自动报警", "消防"]
  },
  {
    "clause_id": "GB50160-2008-11.1.2",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "11.1.2",
    "content": "甲、乙类装置或厂房内，应设置火灾自动报警系统。",
    "discipline": "process",
    "category": "火灾报警",
    "mandatory": true,
    "tags": ["火灾报警", "甲乙类", "装置"]
  },
  {
    "clause_id": "GB50160-2008-12.1.1",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "12.1.1",
    "content": "石油化工企业的安全疏散设计，应符合现行国家标准《建筑设计防火规范》GB 50016的有关规定。",
    "discipline": "process",
    "category": "安全疏散",
    "mandatory": true,
    "tags": ["安全疏散", "疏散设计", "安全"]
  },
  {
    "clause_id": "GB50160-2008-12.1.2",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "12.1.2",
    "content": "厂房的安全出口数量，应符合现行国家标准《建筑设计防火规范》GB 50016的有关规定。",
    "discipline": "process",
    "category": "安全疏散",
    "mandatory": true,
    "tags": ["安全出口", "厂房", "疏散"]
  },
  {
    "clause_id": "GB50160-2008-13.1.1",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "13.1.1",
    "content": "石油化工企业的防爆设计，应符合现行国家标准《爆炸危险环境电力装置设计规范》GB 50058的有关规定。",
    "discipline": "process",
    "category": "防爆设计",
    "mandatory": true,
    "tags": ["防爆", "爆炸危险", "安全"]
  },
  {
    "clause_id": "GB50160-2008-13.1.2",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "13.1.2",
    "content": "爆炸危险区域的划分，应符合现行国家标准《爆炸危险环境电力装置设计规范》GB 50058的有关规定。",
    "discipline": "process",
    "category": "防爆设计",
    "mandatory": true,
    "tags": ["爆炸危险", "区域划分", "防爆"]
  },
  {
    "clause_id": "GB50160-2008-14.1.1",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "14.1.1",
    "content": "石油化工企业的应急救援，应符合现行国家标准《石油化工企业设计防火标准》GB 50160的有关规定。",
    "discipline": "process",
    "category": "应急救援",
    "mandatory": true,
    "tags": ["应急救援", "应急预案", "安全"]
  },
  {
    "clause_id": "GB50160-2008-14.1.2",
    "standard": "GB 50160-2008",
    "title": "石油化工企业设计防火标准",
    "clause": "14.1.2",
    "content": "石油化工企业应制定应急救援预案，并定期进行演练。",
    "discipline": "process",
    "category": "应急救援",
    "mandatory": true,
    "tags": ["应急救援", "预案演练", "安全"]
  },

  // 设备专业规范
  {
    "clause_id": "GB150-2011-4.1.1",
    "standard": "GB 150-2011",
    "title": "压力容器",
    "clause": "4.1.1",
    "content": "压力容器的设计压力，应不低于在正常操作条件下可能产生的最高压力。",
    "discipline": "equipment",
    "category": "压力容器",
    "mandatory": true,
    "tags": ["压力容器", "设计压力", "设备"]
  },
  {
    "clause_id": "GB150-2011-4.1.2",
    "standard": "GB 150-2011",
    "title": "压力容器",
    "clause": "4.1.2",
    "content": "压力容器的设计温度，应不低于在正常操作条件下可能达到的最高温度。",
    "discipline": "equipment",
    "category": "压力容器",
    "mandatory": true,
    "tags": ["压力容器", "设计温度", "设备"]
  },
  {
    "clause_id": "GB150-2011-4.1.3",
    "standard": "GB 150-2011",
    "title": "压力容器",
    "clause": "4.1.3",
    "content": "压力容器的壁厚，应根据设计压力、设计温度、材料许用应力和腐蚀裕量等因素确定。",
    "discipline": "equipment",
    "category": "压力容器",
    "mandatory": true,
    "tags": ["压力容器", "壁厚计算", "设备"]
  },
  {
    "clause_id": "GB150-2011-4.1.4",
    "standard": "GB 150-2011",
    "title": "压力容器",
    "clause": "4.1.4",
    "content": "压力容器的焊接接头系数，应根据焊接接头的型式和无损检测要求确定。",
    "discipline": "equipment",
    "category": "压力容器",
    "mandatory": true,
    "tags": ["压力容器", "焊接接头", "无损检测"]
  },
  {
    "clause_id": "GB150-2011-4.1.5",
    "standard": "GB 150-2011",
    "title": "压力容器",
    "clause": "4.1.5",
    "content": "压力容器的腐蚀裕量，应根据介质的腐蚀性和设计使用寿命确定。",
    "discipline": "equipment",
    "category": "压力容器",
    "mandatory": true,
    "tags": ["压力容器", "腐蚀裕量", "设备"]
  },
  {
    "clause_id": "GB150-2011-5.1.1",
    "standard": "GB 150-2011",
    "title": "压力容器",
    "clause": "5.1.1",
    "content": "压力容器的材料，应符合相应国家标准或行业标准的规定。",
    "discipline": "equipment",
    "category": "压力容器材料",
    "mandatory": true,
    "tags": ["压力容器", "材料", "标准"]
  },
  {
    "clause_id": "GB150-2011-5.1.2",
    "standard": "GB 150-2011",
    "title": "压力容器",
    "clause": "5.1.2",
    "content": "压力容器用钢的许用应力，应根据材料的强度标准值和安全系数确定。",
    "discipline": "equipment",
    "category": "压力容器材料",
    "mandatory": true,
    "tags": ["压力容器", "许用应力", "安全系数"]
  },
  {
    "clause_id": "GB150-2011-5.1.3",
    "standard": "GB 150-2011",
    "title": "压力容器",
    "clause": "5.1.3",
    "content": "压力容器用钢的冲击试验要求，应根据设计温度和材料种类确定。",
    "discipline": "equipment",
    "category": "压力容器材料",
    "mandatory": true,
    "tags": ["压力容器", "冲击试验", "设计温度"]
  },
  {
    "clause_id": "GB150-2011-6.1.1",
    "standard": "GB 150-2011",
    "title": "压力容器",
    "clause": "6.1.1",
    "content": "压力容器的制造，应符合设计图样和本标准的规定。",
    "discipline": "equipment",
    "category": "压力容器制造",
    "mandatory": true,
    "tags": ["压力容器", "制造", "设计图样"]
  },
  {
    "clause_id": "GB150-2011-6.1.2",
    "standard": "GB 150-2011",
    "title": "压力容器",
    "clause": "6.1.2",
    "content": "压力容器的焊接，应由持有相应资格证书的焊工进行。",
    "discipline": "equipment",
    "category": "压力容器制造",
    "mandatory": true,
    "tags": ["压力容器", "焊接", "焊工资格"]
  },
  {
    "clause_id": "GB150-2011-6.1.3",
    "standard": "GB 150-2011",
    "title": "压力容器",
    "clause": "6.1.3",
    "content": "压力容器的无损检测，应符合相应国家标准或行业标准的规定。",
    "discipline": "equipment",
    "category": "压力容器制造",
    "mandatory": true,
    "tags": ["压力容器", "无损检测", "制造"]
  },
  {
    "clause_id": "GB150-2011-7.1.1",
    "standard": "GB 150-2011",
    "title": "压力容器",
    "clause": "7.1.1",
    "content": "压力容器的检验和试验，应符合本标准的规定。",
    "discipline": "equipment",
    "category": "压力容器检验",
    "mandatory": true,
    "tags": ["压力容器", "检验", "试验"]
  },
  {
    "clause_id": "GB150-2011-7.1.2",
    "standard": "GB 150-2011",
    "title": "压力容器",
    "clause": "7.1.2",
    "content": "压力容器的耐压试验，应采用液压试验或气压试验。",
    "discipline": "equipment",
    "category": "压力容器检验",
    "mandatory": true,
    "tags": ["压力容器", "耐压试验", "液压试验"]
  },
  {
    "clause_id": "GB150-2011-7.1.3",
    "standard": "GB 150-2011",
    "title": "压力容器",
    "clause": "7.1.3",
    "content": "压力容器的气密性试验，应在耐压试验合格后进行。",
    "discipline": "equipment",
    "category": "压力容器检验",
    "mandatory": true,
    "tags": ["压力容器", "气密性试验", "检验"]
  },
  {
    "clause_id": "GB150-2011-8.1.1",
    "standard": "GB 150-2011",
    "title": "压力容器",
    "clause": "8.1.1",
    "content": "压力容器的安装，应符合设计图样和本标准的规定。",
    "discipline": "equipment",
    "category": "压力容器安装",
    "mandatory": true,
    "tags": ["压力容器", "安装", "设计图样"]
  },
  {
    "clause_id": "GB150-2011-8.1.2",
    "standard": "GB 150-2011",
    "title": "压力容器",
    "clause": "8.1.2",
    "content": "压力容器的安装，应由具有相应资质的单位进行。",
    "discipline": "equipment",
    "category": "压力容器安装",
    "mandatory": true,
    "tags": ["压力容器", "安装资质", "安装"]
  },
  {
    "clause_id": "GB150-2011-9.1.1",
    "standard": "GB 150-2011",
    "title": "压力容器",
    "clause": "9.1.1",
    "content": "压力容器的使用，应符合本标准的规定。",
    "discipline": "equipment",
    "category": "压力容器使用",
    "mandatory": true,
    "tags": ["压力容器", "使用", "安全"]
  },
  {
    "clause_id": "GB150-2011-9.1.2",
    "standard": "GB 150-2011",
    "title": "压力容器",
    "clause": "9.1.2",
    "content": "压力容器的使用单位，应建立压力容器技术档案。",
    "discipline": "equipment",
    "category": "压力容器使用",
    "mandatory": true,
    "tags": ["压力容器", "技术档案", "使用"]
  },
  {
    "clause_id": "GB150-2011-10.1.1",
    "standard": "GB 150-2011",
    "title": "压力容器",
    "clause": "10.1.1",
    "content": "压力容器的定期检验，应符合《压力容器定期检验规则》的规定。",
    "discipline": "equipment",
    "category": "压力容器检验",
    "mandatory": true,
    "tags": ["压力容器", "定期检验", "安全"]
  },
  {
    "clause_id": "GB150-2011-10.1.2",
    "standard": "GB 150-2011",
    "title": "压力容器",
    "clause": "10.1.2",
    "content": "压力容器的定期检验，包括年度检查和全面检验。",
    "discipline": "equipment",
    "category": "压力容器检验",
    "mandatory": true,
    "tags": ["压力容器", "年度检查", "全面检验"]
  },

  // 管道专业规范
  {
    "clause_id": "GB/T20801-2020-4.1.1",
    "standard": "GB/T 20801-2020",
    "title": "压力管道规范-工业管道",
    "clause": "4.1.1",
    "content": "工业管道的设计压力，应不低于在正常操作条件下可能产生的最高压力。",
    "discipline": "piping",
    "category": "压力管道",
    "mandatory": true,
    "tags": ["压力管道", "设计压力", "管道"]
  },
  {
    "clause_id": "GB/T20801-2020-4.1.2",
    "standard": "GB/T 20801-2020",
    "title": "压力管道规范-工业管道",
    "clause": "4.1.2",
    "content": "工业管道的设计温度，应不低于在正常操作条件下可能达到的最高温度。",
    "discipline": "piping",
    "category": "压力管道",
    "mandatory": true,
    "tags": ["压力管道", "设计温度", "管道"]
  },
  {
    "clause_id": "GB/T20801-2020-4.1.3",
    "standard": "GB/T 20801-2020",
    "title": "压力管道规范-工业管道",
    "clause": "4.1.3",
    "content": "工业管道的壁厚，应根据设计压力、设计温度、材料许用应力和腐蚀裕量等因素确定。",
    "discipline": "piping",
    "category": "压力管道",
    "mandatory": true,
    "tags": ["压力管道", "壁厚计算", "管道"]
  },
  {
    "clause_id": "GB/T20801-2020-4.1.4",
    "standard": "GB/T 20801-2020",
    "title": "压力管道规范-工业管道",
    "clause": "4.1.4",
    "content": "工业管道的焊接接头系数，应根据焊接接头的型式和无损检测要求确定。",
    "discipline": "piping",
    "category": "压力管道",
    "mandatory": true,
    "tags": ["压力管道", "焊接接头", "无损检测"]
  },
  {
    "clause_id": "GB/T20801-2020-4.1.5",
    "standard": "GB/T 20801-2020",
    "title": "压力管道规范-工业管道",
    "clause": "4.1.5",
    "content": "工业管道的腐蚀裕量，应根据介质的腐蚀性和设计使用寿命确定。",
    "discipline": "piping",
    "category": "压力管道",
    "mandatory": true,
    "tags": ["压力管道", "腐蚀裕量", "管道"]
  },
  {
    "clause_id": "GB/T20801-2020-5.1.1",
    "standard": "GB/T 20801-2020",
    "title": "压力管道规范-工业管道",
    "clause": "5.1.1",
    "content": "工业管道的材料，应符合相应国家标准或行业标准的规定。",
    "discipline": "piping",
    "category": "压力管道材料",
    "mandatory": true,
    "tags": ["压力管道", "材料", "标准"]
  },
  {
    "clause_id": "GB/T20801-2020-5.1.2",
    "standard": "GB/T 20801-2020",
    "title": "压力管道规范-工业管道",
    "clause": "5.1.2",
    "content": "工业管道用钢的许用应力，应根据材料的强度标准值和安全系数确定。",
    "discipline": "piping",
    "category": "压力管道材料",
    "mandatory": true,
    "tags": ["压力管道", "许用应力", "安全系数"]
  },
  {
    "clause_id": "GB/T20801-2020-5.1.3",
    "standard": "GB/T 20801-2020",
    "title": "压力管道规范-工业管道",
    "clause": "5.1.3",
    "content": "工业管道用钢的冲击试验要求，应根据设计温度和材料种类确定。",
    "discipline": "piping",
    "category": "压力管道材料",
    "mandatory": true,
    "tags": ["压力管道", "冲击试验", "设计温度"]
  },
  {
    "clause_id": "GB/T20801-2020-6.1.1",
    "standard": "GB/T 20801-2020",
    "title": "压力管道规范-工业管道",
    "clause": "6.1.1",
    "content": "工业管道的制造，应符合设计图样和本标准的规定。",
    "discipline": "piping",
    "category": "压力管道制造",
    "mandatory": true,
    "tags": ["压力管道", "制造", "设计图样"]
  },
  {
    "clause_id": "GB/T20801-2020-6.1.2",
    "standard": "GB/T 20801-2020",
    "title": "压力管道规范-工业管道",
    "clause": "6.1.2",
    "content": "工业管道的焊接，应由持有相应资格证书的焊工进行。",
    "discipline": "piping",
    "category": "压力管道制造",
    "mandatory": true,
    "tags": ["压力管道", "焊接", "焊工资格"]
  },
  {
    "clause_id": "GB/T20801-2020-6.1.3",
    "standard": "GB/T 20801-2020",
    "title": "压力管道规范-工业管道",
    "clause": "6.1.3",
    "content": "工业管道的无损检测，应符合相应国家标准或行业标准的规定。",
    "discipline": "piping",
    "category": "压力管道制造",
    "mandatory": true,
    "tags": ["压力管道", "无损检测", "制造"]
  },
  {
    "clause_id": "GB/T20801-2020-7.1.1",
    "standard": "GB/T 20801-2020",
    "title": "压力管道规范-工业管道",
    "clause": "7.1.1",
    "content": "工业管道的检验和试验，应符合本标准的规定。",
    "discipline": "piping",
    "category": "压力管道检验",
    "mandatory": true,
    "tags": ["压力管道", "检验", "试验"]
  },
  {
    "clause_id": "GB/T20801-2020-7.1.2",
    "standard": "GB/T 20801-2020",
    "title": "压力管道规范-工业管道",
    "clause": "7.1.2",
    "content": "工业管道的耐压试验，应采用液压试验或气压试验。",
    "discipline": "piping",
    "category": "压力管道检验",
    "mandatory": true,
    "tags": ["压力管道", "耐压试验", "液压试验"]
  },
  {
    "clause_id": "GB/T20801-2020-7.1.3",
    "standard": "GB/T 20801-2020",
    "title": "压力管道规范-工业管道",
    "clause": "7.1.3",
    "content": "工业管道的气密性试验，应在耐压试验合格后进行。",
    "discipline": "piping",
    "category": "压力管道检验",
    "mandatory": true,
    "tags": ["压力管道", "气密性试验", "检验"]
  },
  {
    "clause_id": "GB/T20801-2020-8.1.1",
    "standard": "GB/T 20801-2020",
    "title": "压力管道规范-工业管道",
    "clause": "8.1.1",
    "content": "工业管道的安装，应符合设计图样和本标准的规定。",
    "discipline": "piping",
    "category": "压力管道安装",
    "mandatory": true,
    "tags": ["压力管道", "安装", "设计图样"]
  },
  {
    "clause_id": "GB/T20801-2020-8.1.2",
    "standard": "GB/T 20801-2020",
    "title": "压力管道规范-工业管道",
    "clause": "8.1.2",
    "content": "工业管道的安装，应由具有相应资质的单位进行。",
    "discipline": "piping",
    "category": "压力管道安装",
    "mandatory": true,
    "tags": ["压力管道", "安装资质", "安装"]
  },
  {
    "clause_id": "GB/T20801-2020-9.1.1",
    "standard": "GB/T 20801-2020",
    "title": "压力管道规范-工业管道",
    "clause": "9.1.1",
    "content": "工业管道的使用，应符合本标准的规定。",
    "discipline": "piping",
    "category": "压力管道使用",
    "mandatory": true,
    "tags": ["压力管道", "使用", "安全"]
  },
  {
    "clause_id": "GB/T20801-2020-9.1.2",
    "standard": "GB/T 20801-2020",
    "title": "压力管道规范-工业管道",
    "clause": "9.1.2",
    "content": "工业管道的使用单位，应建立工业管道技术档案。",
    "discipline": "piping",
    "category": "压力管道使用",
    "mandatory": true,
    "tags": ["压力管道", "技术档案", "使用"]
  },
  {
    "clause_id": "GB/T20801-2020-10.1.1",
    "standard": "GB/T 20801-2020",
    "title": "压力管道规范-工业管道",
    "clause": "10.1.1",
    "content": "工业管道的定期检验，应符合《压力管道定期检验规则》的规定。",
    "discipline": "piping",
    "category": "压力管道检验",
    "mandatory": true,
    "tags": ["压力管道", "定期检验", "安全"]
  },
  {
    "clause_id": "GB/T20801-2020-10.1.2",
    "standard": "GB/T 20801-2020",
    "title": "压力管道规范-工业管道",
    "clause": "10.1.2",
    "content": "工业管道的定期检验，包括在线检验和全面检验。",
    "discipline": "piping",
    "category": "压力管道检验",
    "mandatory": true,
    "tags": ["压力管道", "在线检验", "全面检验"]
  },

  // 电气专业规范
  {
    "clause_id": "GB50058-2014-4.1.1",
    "standard": "GB 50058-2014",
    "title": "爆炸危险环境电力装置设计规范",
    "clause": "4.1.1",
    "content": "爆炸危险环境的电力装置设计，应符合本规范的规定。",
    "discipline": "electrical",
    "category": "爆炸危险环境",
    "mandatory": true,
    "tags": ["爆炸危险", "电力装置", "电气"]
  },
  {
    "clause_id": "GB50058-2014-4.1.2",
    "standard": "GB 50058-2014",
    "title": "爆炸危险环境电力装置设计规范",
    "clause": "4.1.2",
    "content": "爆炸危险区域的划分，应根据爆炸性气体环境或爆炸性粉尘环境出现的频率和持续时间确定。",
    "discipline": "electrical",
    "category": "爆炸危险环境",
    "mandatory": true,
    "tags": ["爆炸危险", "区域划分", "电气"]
  },
  {
    "clause_id": "GB50058-2014-4.1.3",
    "standard": "GB 50058-2014",
    "title": "爆炸危险环境电力装置设计规范",
    "clause": "4.1.3",
    "content": "爆炸危险区域的等级，应分为0区、1区、2区（气体环境）或20区、21区、22区（粉尘环境）。",
    "discipline": "electrical",
    "category": "爆炸危险环境",
    "mandatory": true,
    "tags": ["爆炸危险", "区域等级", "电气"]
  },
  {
    "clause_id": "GB50058-2014-5.1.1",
    "standard": "GB 50058-2014",
    "title": "爆炸危险环境电力装置设计规范",
    "clause": "5.1.1",
    "content": "爆炸危险环境的电气设备，应符合现行国家标准《爆炸性环境》GB 3836的有关规定。",
    "discipline": "electrical",
    "category": "防爆电气",
    "mandatory": true,
    "tags": ["防爆电气", "电气设备", "爆炸危险"]
  },
  {
    "clause_id": "GB50058-2014-5.1.2",
    "standard": "GB 50058-2014",
    "title": "爆炸危险环境电力装置设计规范",
    "clause": "5.1.2",
    "content": "爆炸危险环境的电气设备，应根据爆炸危险区域的等级和爆炸性物质的种类选择。",
    "discipline": "electrical",
    "category": "防爆电气",
    "mandatory": true,
    "tags": ["防爆电气", "设备选择", "爆炸危险"]
  },
  {
    "clause_id": "GB50058-2014-5.1.3",
    "standard": "GB 50058-2014",
    "title": "爆炸危险环境电力装置设计规范",
    "clause": "5.1.3",
    "content": "爆炸危险环境的电气设备，应具有防爆合格证。",
    "discipline": "electrical",
    "category": "防爆电气",
    "mandatory": true,
    "tags": ["防爆电气", "防爆合格证", "电气设备"]
  },
  {
    "clause_id": "GB50058-2014-6.1.1",
    "standard": "GB 50058-2014",
    "title": "爆炸危险环境电力装置设计规范",
    "clause": "6.1.1",
    "content": "爆炸危险环境的电气线路，应符合本规范的规定。",
    "discipline": "electrical",
    "category": "防爆电气线路",
    "mandatory": true,
    "tags": ["防爆电气", "电气线路", "爆炸危险"]
  },
  {
    "clause_id": "GB50058-2014-6.1.2",
    "standard": "GB 50058-2014",
    "title": "爆炸危险环境电力装置设计规范",
    "clause": "6.1.2",
    "content": "爆炸危险环境的电气线路，应采用铜芯电缆或电线。",
    "discipline": "electrical",
    "category": "防爆电气线路",
    "mandatory": true,
    "tags": ["防爆电气", "铜芯电缆", "电气线路"]
  },
  {
    "clause_id": "GB50058-2014-6.1.3",
    "standard": "GB 50058-2014",
    "title": "爆炸危险环境电力装置设计规范",
    "clause": "6.1.3",
    "content": "爆炸危险环境的电气线路，应采用电缆桥架或穿管敷设。",
    "discipline": "electrical",
    "category": "防爆电气线路",
    "mandatory": true,
    "tags": ["防爆电气", "电缆桥架", "穿管敷设"]
  },
  {
    "clause_id": "GB50058-2014-7.1.1",
    "standard": "GB 50058-2014",
    "title": "爆炸危险环境电力装置设计规范",
    "clause": "7.1.1",
    "content": "爆炸危险环境的接地设计，应符合现行国家标准《交流电气装置的接地设计规范》GB 50065的有关规定。",
    "discipline": "electrical",
    "category": "防爆接地",
    "mandatory": true,
    "tags": ["防爆接地", "接地设计", "电气"]
  },
  {
    "clause_id": "GB50058-2014-7.1.2",
    "standard": "GB 50058-2014",
    "title": "爆炸危险环境电力装置设计规范",
    "clause": "7.1.2",
    "content": "爆炸危险环境的电气设备，应可靠接地。",
    "discipline": "electrical",
    "category": "防爆接地",
    "mandatory": true,
    "tags": ["防爆接地", "电气设备", "可靠接地"]
  },
  {
    "clause_id": "GB50058-2014-7.1.3",
    "standard": "GB 50058-2014",
    "title": "爆炸危险环境电力装置设计规范",
    "clause": "7.1.3",
    "content": "爆炸危险环境的接地电阻，不应大于4Ω。",
    "discipline": "electrical",
    "category": "防爆接地",
    "mandatory": true,
    "tags": ["防爆接地", "接地电阻", "电气"]
  },
  {
    "clause_id": "GB50058-2014-8.1.1",
    "standard": "GB 50058-2014",
    "title": "爆炸危险环境电力装置设计规范",
    "clause": "8.1.1",
    "content": "爆炸危险环境的防雷设计，应符合现行国家标准《建筑物防雷设计规范》GB 50057的有关规定。",
    "discipline": "electrical",
    "category": "防爆防雷",
    "mandatory": true,
    "tags": ["防爆防雷", "防雷设计", "电气"]
  },
  {
    "clause_id": "GB50058-2014-8.1.2",
    "standard": "GB 50058-2014",
    "title": "爆炸危险环境电力装置设计规范",
    "clause": "8.1.2",
    "content": "爆炸危险环境的防静电设计，应符合现行国家标准《石油化工静电接地设计规范》SH 3097的有关规定。",
    "discipline": "electrical",
    "category": "防爆防静电",
    "mandatory": true,
    "tags": ["防爆防静电", "防静电设计", "电气"]
  },
  {
    "clause_id": "GB50058-2014-8.1.3",
    "standard": "GB 50058-2014",
    "title": "爆炸危险环境电力装置设计规范",
    "clause": "8.1.3",
    "content": "爆炸危险环境的防静电接地电阻，不应大于100Ω。",
    "discipline": "electrical",
    "category": "防爆防静电",
    "mandatory": true,
    "tags": ["防爆防静电", "接地电阻", "电气"]
  },
  {
    "clause_id": "GB50058-2014-9.1.1",
    "standard": "GB 50058-2014",
    "title": "爆炸危险环境电力装置设计规范",
    "clause": "9.1.1",
    "content": "爆炸危险环境的照明设计，应符合本规范的规定。",
    "discipline": "electrical",
    "category": "防爆照明",
    "mandatory": true,
    "tags": ["防爆照明", "照明设计", "电气"]
  },
  {
    "clause_id": "GB50058-2014-9.1.2",
    "standard": "GB 50058-2014",
    "title": "爆炸危险环境电力装置设计规范",
    "clause": "9.1.2",
    "content": "爆炸危险环境的照明灯具，应采用防爆型灯具。",
    "discipline": "electrical",
    "category": "防爆照明",
    "mandatory": true,
    "tags": ["防爆照明", "防爆灯具", "电气"]
  },
  {
    "clause_id": "GB50058-2014-9.1.3",
    "standard": "GB 50058-2014",
    "title": "爆炸危险环境电力装置设计规范",
    "clause": "9.1.3",
    "content": "爆炸危险环境的照明线路，应采用铜芯电缆或电线。",
    "discipline": "electrical",
    "category": "防爆照明",
    "mandatory": true,
    "tags": ["防爆照明", "铜芯电缆", "电气线路"]
  },
  {
    "clause_id": "GB50058-2014-10.1.1",
    "standard": "GB 50058-2014",
    "title": "爆炸危险环境电力装置设计规范",
    "clause": "10.1.1",
    "content": "爆炸危险环境的通信设计，应符合本规范的规定。",
    "discipline": "electrical",
    "category": "防爆通信",
    "mandatory": true,
    "tags": ["防爆通信", "通信设计", "电气"]
  },
  {
    "clause_id": "GB50058-2014-10.1.2",
    "standard": "GB 50058-2014",
    "title": "爆炸危险环境电力装置设计规范",
    "clause": "10.1.2",
    "content": "爆炸危险环境的通信设备，应采用防爆型设备。",
    "discipline": "electrical",
    "category": "防爆通信",
    "mandatory": true,
    "tags": ["防爆通信", "防爆设备", "电气"]
  },
  {
    "clause_id": "GB50058-2014-10.1.3",
    "standard": "GB 50058-2014",
    "title": "爆炸危险环境电力装置设计规范",
    "clause": "10.1.3",
    "content": "爆炸危险环境的通信线路，应采用铜芯电缆或电线。",
    "discipline": "electrical",
    "category": "防爆通信",
    "mandatory": true,
    "tags": ["防爆通信", "铜芯电缆", "电气线路"]
  }
];

// 添加到知识库
knowledge.clauses = knowledge.clauses || [];
knowledge.clauses.push(...newClauses);

// 更新统计信息
const disciplines = {};
for (const clause of knowledge.clauses) {
  const disc = clause.discipline || "";
  disciplines[disc] = (disciplines[disc] || 0) + 1;
}

knowledge.stats.total_clauses = knowledge.clauses.length;
knowledge.stats.disciplines = disciplines;

// 保存
fs.writeFileSync(V2_PATH, JSON.stringify(knowledge, null, 2));

console.log(`✅ 已添加 ${newClauses.length} 条规范条文`);
console.log(`📊 当前总条文数: ${knowledge.clauses.length}`);
console.log(`📈 各专业条文数:`);
for (const [disc, count] of Object.entries(disciplines)) {
  console.log(`   ${disc || "通用"}: ${count}`);
}