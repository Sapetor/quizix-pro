/**
 * Unit Tests for AI Content Detection Patterns
 * Tests regex patterns used to detect content types in AI Generator
 *
 * Note: Patterns are duplicated here since config.js uses ES modules.
 * Keep in sync with public/js/core/config.js AI section.
 */

// Content detection patterns (copied from config.js AI section)
// Multi-language support: EN, ES, FR, DE, IT, PT, PL, JA, ZH keywords
const AI = {
    MATH_INDICATORS: /\$[^$]+\$|\\\(.*?\\\)|\\\[.*?\\\]|\\frac\{|\\sqrt\{|\\sum|\\int|\\lim|\\infty|\\alpha|\\beta|\\gamma|\\theta|\\pi|\\sigma|\\Delta|equation|formula|algebra|calculus|geometry|derivative|integral|matrix|vector|polynomial|logarithm|exponential|trigonometry|quadratic|linear equation|probability|statistics|mean|median|variance|standard deviation|ecuación|fórmula|álgebra|cálculo|geometría|derivada|matemáticas|équation|formule|algèbre|calcul|géométrie|dérivée|mathématiques|Gleichung|Formel|Algebra|Geometrie|Ableitung|Mathematik|equazione|matrice|vettore|polinomio|matematica|equação|matriz|vetor|polinômio|matemática|równanie|wzór|macierz|wektor|matematyka|数学|方程式|代数|微分|積分|幾何|行列|数学|方程|代数|微分|积分|几何|矩阵/i,

    // Programming - includes code syntax AND topic keywords
    PROGRAMMING_INDICATORS: /\b(def|function|class|import|from|export|const|let|var|return|if|else|for|while|switch|case|try|catch|async|await|yield)\s+\w+|console\.(log|error|warn)|print\(|System\.out|public\s+static|private\s+|protected\s+|\#include|using\s+namespace|SELECT\s+.*FROM|CREATE\s+TABLE|INSERT\s+INTO|UPDATE\s+.*SET|\.map\(|\.filter\(|\.reduce\(|=>|->|\$\{.*\}|f".*\{|`.*\$\{|\bprogramming\b|\bcoding\b|\bcode\b|\balgorithm\b|\bsoftware\b|\bdevelop(er|ment)?\b|\bAPI\b|\bdebug(ging)?\b|\bcompil(e|er)\b|\bsyntax\b|\bloop\b|\barray\b|\bstring\b|\bboolean\b|\binteger\b|\bfloat\b|\bdatabase\b|\bfrontend\b|\bbackend\b|\bframework\b|\blibrary\b|\bprogramación\b|\bcódigo\b|\balgoritmo\b|\bprogrammation\b|\balgorithme\b|\bProgrammierung\b|\bAlgorithmus\b|\bprogrammazione\b|\balgoritmo\b|\bprogramação\b|\bprogramowanie\b|\balgorytm\b|プログラミング|コード|アルゴリズム|编程|代码|算法/i,

    PHYSICS_INDICATORS: /velocity|acceleration|force|energy|momentum|gravity|mass|physics|newton|joule|watt|ampere|volt|ohm|frequency|wavelength|photon|quantum|relativity|thermodynamics|entropy|kinetic|potential|electric|magnetic|electromagnetic|optics|nuclear|particle|wave|oscillation|pendulum|friction|torque|angular|pressure|density|buoyancy|refraction|velocidad|aceleración|fuerza|energía|física|gravedad|vitesse|accélération|physique|gravité|Geschwindigkeit|Beschleunigung|Kraft|Energie|Physik|Schwerkraft|velocità|accelerazione|fisica|gravità|velocidade|aceleração|física|gravidade|prędkość|przyspieszenie|fizyka|grawitacja|物理|速度|加速度|力|エネルギー|重力|物理学|能量/i,

    CHEMISTRY_INDICATORS: /molecule|atom|chemical|compound|chemical reaction|chemistry|periodic table|electron shell|proton|neutron|ion|covalent|ionic bond|mole\b|molarity|pH level|\bacid\b|\bbase\b.*\bacid|oxidation|reduction|catalyst|organic chemistry|inorganic|polymer|isotope|valence|orbital|electronegativity|stoichiometry|titration|precipitate|enthalpy|H2O|NaCl|CO2|O2|chemical formula|chemical equation|molécula|átomo|químico|química|reacción química|tabla periódica|molécule|atome|chimie|réaction chimique|tableau périodique|Molekül|Atom|Chemie|chemische Reaktion|Periodensystem|molecola|chimica|reazione chimica|tavola periodica|molécula|átomo|química|reação química|tabela periódica|cząsteczka|atom|chemia|reakcja chemiczna|układ okresowy|分子|原子|化学|化学反応|周期表|化学反应|元素周期表/i,

    BIOLOGY_INDICATORS: /cell|DNA|RNA|protein|enzyme|organism|species|evolution|genetics|chromosome|gene|mutation|mitosis|meiosis|photosynthesis|respiration|metabolism|bacteria|virus|ecosystem|biodiversity|anatomy|physiology|neuron|synapse|hormone|immune|antibody|vaccine|pathogen|tissue|organ|célula|proteína|enzima|organismo|especie|evolución|genética|cromosoma|cellule|protéine|organisme|espèce|évolution|génétique|Zelle|Protein|Enzym|Organismus|Spezies|Evolution|Genetik|Chromosom|cellula|proteina|enzima|organismo|specie|evoluzione|genetica|cromosoma|célula|proteína|enzima|organismo|espécie|evolução|genética|cromossomo|komórka|białko|enzym|organizm|gatunek|ewolucja|genetyka|chromosom|細胞|タンパク質|酵素|生物|進化|遺伝|染色体|细胞|蛋白质|酶|生物|进化|遗传|染色体/i,

    HISTORY_INDICATORS: /century|ancient|medieval|renaissance|revolution|war|empire|dynasty|civilization|king|queen|emperor|president|treaty|battle|independence|colonial|industrial|world\s+war|cold\s+war|democracy|monarchy|republic|constitution|amendment|civil\s+rights|historical|siglo|antiguo|medieval|renacimiento|revolución|guerra|imperio|siècle|ancien|médiéval|renaissance|révolution|guerre|empire|Jahrhundert|antik|mittelalterlich|Renaissance|Revolution|Krieg|Reich|secolo|antico|medievale|rinascimento|rivoluzione|guerra|impero|século|antigo|medieval|renascimento|revolução|guerra|império|wiek|starożytny|średniowieczny|renesans|rewolucja|wojna|imperium|世紀|古代|中世|ルネサンス|革命|戦争|帝国|世纪|古代|中世纪|文艺复兴|革命|战争|帝国/i,

    ECONOMICS_INDICATORS: /economy|GDP|inflation|deflation|supply|demand|market|trade|investment|stock|bond|currency|fiscal|monetary|budget|tax|tariff|subsidy|unemployment|recession|growth|capitalism|socialism|microeconomics|macroeconomics|equilibrium|elasticity|monopoly|oligopoly|economía|PIB|inflación|mercado|comercio|inversión|économie|marché|commerce|investissement|Wirtschaft|BIP|Inflation|Markt|Handel|Investition|economia|mercato|commercio|investimento|economia|mercado|comércio|investimento|gospodarka|PKB|inflacja|rynek|handel|inwestycja|経済|GDP|インフレ|市場|貿易|投資|经济|通货膨胀|市场|贸易|投资/i,

    CODE_LANGUAGE_HINTS: {
        python: /\bdef\s+\w+\(|\bimport\s+\w+|\bfrom\s+\w+\s+import|\bclass\s+\w+:|\bif\s+__name__\s*==|\bself\.\w+|\bprint\s*\(/i,
        javascript: /\bconst\s+\w+\s*=|\blet\s+\w+\s*=|\bfunction\s+\w+\s*\(|=>\s*\{|\bconsole\.(log|error|warn)|\basync\s+function|\bawait\s+/i,
        java: /\bpublic\s+(static\s+)?(void|class|int|String)|\bprivate\s+|\bprotected\s+|\bSystem\.out\.print/i,
        sql: /\bSELECT\s+.*\bFROM\b|\bCREATE\s+TABLE\b|\bINSERT\s+INTO\b|\bUPDATE\s+.*\bSET\b|\bDELETE\s+FROM\b|\bJOIN\b.*\bON\b/i,
        cpp: /\#include\s*<|\busing\s+namespace\s+std|\bstd::|\bcout\s*<<|\bcin\s*>>|\bint\s+main\s*\(/i,
        html: /<(!DOCTYPE|html|head|body|div|span|p|a|img|table|form|input|button)\b/i,
        css: /\{[^}]*:\s*[^;]+;[^}]*\}|@media\s+|@keyframes\s+|\.[\w-]+\s*\{|#[\w-]+\s*\{/i
    }
};

describe('Content Detection Patterns', () => {

    describe('MATH_INDICATORS', () => {
        const pattern = AI.MATH_INDICATORS;

        it('should detect algebra keywords (English)', () => {
            expect(pattern.test('algebra equation')).toBe(true);
            expect(pattern.test('solve the equation')).toBe(true);
            expect(pattern.test('quadratic formula')).toBe(true);
        });

        it('should detect math in Spanish', () => {
            expect(pattern.test('ecuación algebraica')).toBe(true);
            expect(pattern.test('fórmula matemática')).toBe(true);
            expect(pattern.test('cálculo diferencial')).toBe(true);
        });

        it('should detect math in French', () => {
            expect(pattern.test('équation algébrique')).toBe(true);
            expect(pattern.test('formule mathématique')).toBe(true);
            expect(pattern.test('calcul intégral')).toBe(true);
        });

        it('should detect math in German', () => {
            expect(pattern.test('Gleichung lösen')).toBe(true);
            expect(pattern.test('Mathematik Formel')).toBe(true);
            expect(pattern.test('Algebra Grundlagen')).toBe(true);
        });

        it('should detect math in Japanese', () => {
            expect(pattern.test('数学の問題')).toBe(true);
            expect(pattern.test('方程式を解く')).toBe(true);
            expect(pattern.test('微分積分')).toBe(true);
        });

        it('should detect math in Chinese', () => {
            expect(pattern.test('数学题')).toBe(true);
            expect(pattern.test('代数方程')).toBe(true);
            expect(pattern.test('矩阵运算')).toBe(true);
        });

        it('should detect LaTeX notation', () => {
            expect(pattern.test('$x^2 + y^2$')).toBe(true);
            expect(pattern.test('\\frac{1}{2}')).toBe(true);
            expect(pattern.test('\\sqrt{4}')).toBe(true);
        });

        it('should not match general text', () => {
            expect(pattern.test('hello world')).toBe(false);
            expect(pattern.test('what is the weather')).toBe(false);
        });
    });

    describe('PROGRAMMING_INDICATORS', () => {
        const pattern = AI.PROGRAMMING_INDICATORS;

        it('should detect JavaScript code', () => {
            expect(pattern.test('function test() {')).toBe(true);
            expect(pattern.test('const x = 5')).toBe(true);
            expect(pattern.test('console.log(x)')).toBe(true);
        });

        it('should detect Python code', () => {
            expect(pattern.test('def calculate():')).toBe(true);
            expect(pattern.test('import numpy')).toBe(true);
            expect(pattern.test('print(result)')).toBe(true);
        });

        it('should detect programming topic keywords (English)', () => {
            expect(pattern.test('write code for sorting')).toBe(true);
            expect(pattern.test('programming tutorial')).toBe(true);
            expect(pattern.test('algorithm complexity')).toBe(true);
            expect(pattern.test('software development')).toBe(true);
            expect(pattern.test('debugging tips')).toBe(true);
        });

        it('should detect programming in Spanish', () => {
            expect(pattern.test('programación básica')).toBe(true);
            expect(pattern.test('código fuente')).toBe(true);
            expect(pattern.test('algoritmo de ordenación')).toBe(true);
        });

        it('should detect programming in French', () => {
            expect(pattern.test('programmation web')).toBe(true);
            expect(pattern.test('algorithme de tri')).toBe(true);
        });

        it('should detect programming in German', () => {
            expect(pattern.test('Programmierung lernen')).toBe(true);
            expect(pattern.test('Algorithmus implementieren')).toBe(true);
        });

        it('should detect programming in Japanese', () => {
            expect(pattern.test('プログラミング入門')).toBe(true);
            expect(pattern.test('コード例')).toBe(true);
            expect(pattern.test('アルゴリズム')).toBe(true);
        });

        it('should detect programming in Chinese', () => {
            expect(pattern.test('编程基础')).toBe(true);
            expect(pattern.test('代码示例')).toBe(true);
            expect(pattern.test('算法设计')).toBe(true);
        });

        it('should not match general text', () => {
            expect(pattern.test('hello world')).toBe(false);
            expect(pattern.test('the weather is nice')).toBe(false);
        });
    });

    describe('PHYSICS_INDICATORS', () => {
        const pattern = AI.PHYSICS_INDICATORS;

        it('should detect physics keywords (English)', () => {
            expect(pattern.test('calculate velocity')).toBe(true);
            expect(pattern.test('force and acceleration')).toBe(true);
            expect(pattern.test('kinetic energy')).toBe(true);
        });

        it('should detect physics in Spanish', () => {
            expect(pattern.test('física cuántica')).toBe(true);
            expect(pattern.test('velocidad del sonido')).toBe(true);
            expect(pattern.test('fuerza gravitacional')).toBe(true);
        });

        it('should detect physics in French', () => {
            expect(pattern.test('physique nucléaire')).toBe(true);
            expect(pattern.test('vitesse de la lumière')).toBe(true);
        });

        it('should detect physics in German', () => {
            expect(pattern.test('Physik Grundlagen')).toBe(true);
            expect(pattern.test('Geschwindigkeit berechnen')).toBe(true);
        });

        it('should detect physics in Japanese', () => {
            expect(pattern.test('物理学の法則')).toBe(true);
            expect(pattern.test('エネルギー保存')).toBe(true);
        });

        it('should detect physics in Chinese', () => {
            expect(pattern.test('物理学基础')).toBe(true);
            expect(pattern.test('能量守恒')).toBe(true);
        });

        it('should not match general text', () => {
            expect(pattern.test('hello world')).toBe(false);
        });
    });

    describe('CHEMISTRY_INDICATORS', () => {
        const pattern = AI.CHEMISTRY_INDICATORS;

        it('should detect chemistry keywords (English)', () => {
            expect(pattern.test('chemical reaction')).toBe(true);
            expect(pattern.test('molecule structure')).toBe(true);
            expect(pattern.test('periodic table')).toBe(true);
        });

        it('should detect chemistry in Spanish', () => {
            expect(pattern.test('química orgánica')).toBe(true);
            expect(pattern.test('tabla periódica')).toBe(true);
            expect(pattern.test('reacción química')).toBe(true);
        });

        it('should detect chemistry in French', () => {
            expect(pattern.test('chimie organique')).toBe(true);
            expect(pattern.test('tableau périodique')).toBe(true);
        });

        it('should detect chemistry in German', () => {
            expect(pattern.test('Chemie Grundlagen')).toBe(true);
            expect(pattern.test('Periodensystem')).toBe(true);
        });

        it('should detect chemistry in Japanese', () => {
            expect(pattern.test('化学反応')).toBe(true);
            expect(pattern.test('周期表')).toBe(true);
        });

        it('should detect chemistry in Chinese', () => {
            expect(pattern.test('化学反应')).toBe(true);
            expect(pattern.test('元素周期表')).toBe(true);
        });

        it('should not match ambiguous terms alone', () => {
            expect(pattern.test('base case')).toBe(false);
            expect(pattern.test('basic programming')).toBe(false);
        });
    });

    describe('BIOLOGY_INDICATORS', () => {
        const pattern = AI.BIOLOGY_INDICATORS;

        it('should detect biology keywords (English)', () => {
            expect(pattern.test('cell division')).toBe(true);
            expect(pattern.test('DNA replication')).toBe(true);
            expect(pattern.test('protein synthesis')).toBe(true);
        });

        it('should detect biology in Spanish', () => {
            expect(pattern.test('célula eucariota')).toBe(true);
            expect(pattern.test('evolución natural')).toBe(true);
        });

        it('should detect biology in French', () => {
            expect(pattern.test('cellule eucaryote')).toBe(true);
            expect(pattern.test('évolution naturelle')).toBe(true);
        });

        it('should detect biology in German', () => {
            expect(pattern.test('Zelle und Organismus')).toBe(true);
            expect(pattern.test('Evolution der Arten')).toBe(true);
        });

        it('should detect biology in Japanese', () => {
            expect(pattern.test('細胞分裂')).toBe(true);
            expect(pattern.test('進化論')).toBe(true);
        });

        it('should detect biology in Chinese', () => {
            expect(pattern.test('细胞分裂')).toBe(true);
            expect(pattern.test('进化论')).toBe(true);
        });

        it('should not match general text', () => {
            expect(pattern.test('hello world')).toBe(false);
        });
    });

    describe('HISTORY_INDICATORS', () => {
        const pattern = AI.HISTORY_INDICATORS;

        it('should detect history keywords (English)', () => {
            expect(pattern.test('18th century')).toBe(true);
            expect(pattern.test('French revolution')).toBe(true);
            expect(pattern.test('World War II')).toBe(true);
        });

        it('should detect history in Spanish', () => {
            expect(pattern.test('siglo XIX')).toBe(true);
            expect(pattern.test('revolución industrial')).toBe(true);
            expect(pattern.test('imperio romano')).toBe(true);
        });

        it('should detect history in French', () => {
            expect(pattern.test('siècle des lumières')).toBe(true);
            expect(pattern.test('révolution française')).toBe(true);
        });

        it('should detect history in German', () => {
            expect(pattern.test('Jahrhundert der Aufklärung')).toBe(true);
            expect(pattern.test('Revolution und Krieg')).toBe(true);
        });

        it('should detect history in Japanese', () => {
            expect(pattern.test('世紀の歴史')).toBe(true);
            expect(pattern.test('革命と戦争')).toBe(true);
        });

        it('should detect history in Chinese', () => {
            expect(pattern.test('世纪历史')).toBe(true);
            expect(pattern.test('革命战争')).toBe(true);
        });

        it('should not match general text', () => {
            expect(pattern.test('hello world')).toBe(false);
        });
    });

    describe('ECONOMICS_INDICATORS', () => {
        const pattern = AI.ECONOMICS_INDICATORS;

        it('should detect economics keywords (English)', () => {
            expect(pattern.test('GDP growth')).toBe(true);
            expect(pattern.test('inflation rate')).toBe(true);
            expect(pattern.test('supply and demand')).toBe(true);
        });

        it('should detect economics in Spanish', () => {
            expect(pattern.test('economía global')).toBe(true);
            expect(pattern.test('inflación del mercado')).toBe(true);
        });

        it('should detect economics in French', () => {
            expect(pattern.test('économie mondiale')).toBe(true);
            expect(pattern.test('marché financier')).toBe(true);
        });

        it('should detect economics in German', () => {
            expect(pattern.test('Wirtschaft und Handel')).toBe(true);
            expect(pattern.test('Inflation steigt')).toBe(true);
        });

        it('should detect economics in Japanese', () => {
            expect(pattern.test('経済成長')).toBe(true);
            expect(pattern.test('市場分析')).toBe(true);
        });

        it('should detect economics in Chinese', () => {
            expect(pattern.test('经济增长')).toBe(true);
            expect(pattern.test('市场分析')).toBe(true);
        });

        it('should not match general text', () => {
            expect(pattern.test('hello world')).toBe(false);
        });
    });

    describe('CODE_LANGUAGE_HINTS', () => {
        const hints = AI.CODE_LANGUAGE_HINTS;

        it('should detect Python', () => {
            expect(hints.python.test('def calculate():')).toBe(true);
            expect(hints.python.test('import pandas as pd')).toBe(true);
        });

        it('should detect JavaScript', () => {
            expect(hints.javascript.test('const x = 5')).toBe(true);
            expect(hints.javascript.test('console.log()')).toBe(true);
        });

        it('should detect Java', () => {
            expect(hints.java.test('public static void main')).toBe(true);
            expect(hints.java.test('System.out.println')).toBe(true);
        });

        it('should detect SQL', () => {
            expect(hints.sql.test('SELECT id FROM users')).toBe(true);
            expect(hints.sql.test('CREATE TABLE test')).toBe(true);
        });
    });

    describe('Negative Cases - General Content', () => {
        it('should not match any pattern for general text', () => {
            const generalTexts = [
                'Hello, how are you today?',
                'The quick brown fox jumps over the lazy dog.',
                'What is the capital of France?',
                'List 5 fruits.',
                'Describe a beautiful sunset.'
            ];

            generalTexts.forEach(text => {
                expect(AI.MATH_INDICATORS.test(text)).toBe(false);
                expect(AI.PROGRAMMING_INDICATORS.test(text)).toBe(false);
                expect(AI.PHYSICS_INDICATORS.test(text)).toBe(false);
                expect(AI.CHEMISTRY_INDICATORS.test(text)).toBe(false);
                expect(AI.BIOLOGY_INDICATORS.test(text)).toBe(false);
                expect(AI.HISTORY_INDICATORS.test(text)).toBe(false);
                expect(AI.ECONOMICS_INDICATORS.test(text)).toBe(false);
            });
        });
    });
});
