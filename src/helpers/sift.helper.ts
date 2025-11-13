import { spawn } from 'child_process';
import path from 'path';

/**
 * Interface para o template SIFT
 */
export interface SIFTTemplate {
    keypoints: Array<{
        pt: [number, number];
        size: number;
        angle: number;
        response: number;
        octave: number;
        class_id: number;
    }>;
    descriptors: number[][];
    num_features: number;
}

/**
 * Interface para o resultado da comparação
 */
export interface ComparisonResult {
    similarity: number;
    good_matches: number;
    total_matches: number;
    features_template1: number;
    features_template2: number;
}

/**
 * Extrai características SIFT de um buffer de imagem usando OpenCV via Python
 * @param imageBuffer Buffer da imagem
 * @returns Template SIFT com keypoints e descritores
 */
export async function extractSIFTFeatures(imageBuffer: Buffer): Promise<SIFTTemplate> {
    return new Promise((resolve, reject) => {
        // Caminho para o script Python - tenta vários locais possíveis
        const possiblePaths = [
            path.join(process.cwd(), 'python-scripts', 'sift_processor.py'),
            path.join(__dirname, '..', '..', 'python-scripts', 'sift_processor.py'),
            '/app/python-scripts/sift_processor.py'
        ];
        
        // Encontra o primeiro caminho que existe
        let scriptPath = possiblePaths[0];
        for (const p of possiblePaths) {
            try {
                const fs = require('fs');
                if (fs.existsSync(p)) {
                    scriptPath = p;
                    break;
                }
            } catch (e) {
                // Continua tentando
            }
        }
        
        console.log(`[SIFT] Usando script Python em: ${scriptPath}`);
        
        // Spawna o processo Python
        const pythonProcess = spawn('python3', [scriptPath, 'extract']);
        
        let outputData = '';
        let errorData = '';
        
        // Captura stdout
        pythonProcess.stdout.on('data', (data) => {
            outputData += data.toString();
        });
        
        // Captura stderr
        pythonProcess.stderr.on('data', (data) => {
            errorData += data.toString();
        });
        
        // Quando o processo termina
        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.error('Python stderr:', errorData);
                reject(new Error(`Processo Python falhou com código ${code}: ${errorData}`));
                return;
            }
            
            try {
                const result = JSON.parse(outputData);
                
                if (!result.success) {
                    reject(new Error(result.error || 'Erro ao extrair características SIFT'));
                    return;
                }
                
                resolve({
                    keypoints: result.keypoints,
                    descriptors: result.descriptors,
                    num_features: result.num_features
                });
            } catch (err) {
                reject(new Error(`Erro ao parsear resposta do Python: ${err}`));
            }
        });
        
        // Envia a imagem em base64 para o stdin do Python
        pythonProcess.stdin.write(imageBuffer.toString('base64'));
        pythonProcess.stdin.end();
    });
}

/**
 * Compara dois templates SIFT e retorna o score de similaridade
 * @param template1 Primeiro template SIFT
 * @param template2 Segundo template SIFT
 * @returns Resultado da comparação com score de similaridade
 */
export async function compareSIFTTemplates(
    template1: SIFTTemplate, 
    template2: SIFTTemplate
): Promise<ComparisonResult> {
    return new Promise((resolve, reject) => {
        // Caminho para o script Python - tenta vários locais possíveis
        const possiblePaths = [
            path.join(process.cwd(), 'python-scripts', 'sift_processor.py'),
            path.join(__dirname, '..', '..', 'python-scripts', 'sift_processor.py'),
            '/app/python-scripts/sift_processor.py'
        ];
        
        let scriptPath = possiblePaths[0];
        for (const p of possiblePaths) {
            try {
                const fs = require('fs');
                if (fs.existsSync(p)) {
                    scriptPath = p;
                    break;
                }
            } catch (e) {
                // Continua tentando
            }
        }
        
        const pythonProcess = spawn('python3', [scriptPath, 'compare']);
        
        let outputData = '';
        let errorData = '';
        
        pythonProcess.stdout.on('data', (data) => {
            outputData += data.toString();
        });
        
        pythonProcess.stderr.on('data', (data) => {
            errorData += data.toString();
        });
        
        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.error('Python stderr:', errorData);
                reject(new Error(`Processo Python falhou com código ${code}: ${errorData}`));
                return;
            }
            
            try {
                const result = JSON.parse(outputData);
                
                if (!result.success) {
                    reject(new Error(result.error || 'Erro ao comparar templates SIFT'));
                    return;
                }
                
                resolve({
                    similarity: result.similarity,
                    good_matches: result.good_matches,
                    total_matches: result.total_matches,
                    features_template1: result.features_template1,
                    features_template2: result.features_template2
                });
            } catch (err) {
                reject(new Error(`Erro ao parsear resposta do Python: ${err}`));
            }
        });
        
        const input = JSON.stringify({
            template1,
            template2
        });
        
        pythonProcess.stdin.write(input);
        pythonProcess.stdin.end();
    });
}

/**
 * Valida se um template SIFT tem qualidade suficiente
 * @param template Template SIFT a ser validado
 * @param minFeatures Número mínimo de features requeridas (padrão: 50)
 * @returns true se o template é válido
 */
export function validateSIFTTemplate(template: SIFTTemplate, minFeatures: number = 50): boolean {
    if (!template || !template.descriptors || !template.keypoints) {
        return false;
    }
    
    if (template.num_features < minFeatures) {
        return false;
    }
    
    return true;
}