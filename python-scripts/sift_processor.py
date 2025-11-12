#!/usr/bin/env python3
"""
Processador de impressões digitais usando SIFT (Scale-Invariant Feature Transform)
Este script extrai características robustas de imagens de digitais para autenticação biométrica
"""

import sys
import json
import base64

try:
    import cv2
    import numpy as np
except ImportError as e:
    print(json.dumps({
        'success': False, 
        'error': f'Erro ao importar bibliotecas: {str(e)}. Certifique-se de que py3-opencv e py3-numpy estão instalados.'
    }))
    sys.exit(1)

def preprocess_fingerprint(image):
    """
    Pré-processa a imagem da digital para melhorar a detecção de características
    """
    # Converte para escala de cinza se necessário
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image
    
    # Normalização
    gray = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)
    
    # Equalização de histograma para melhorar o contraste
    gray = cv2.equalizeHist(gray)
    
    # Redução de ruído com filtro bilateral (preserva bordas)
    denoised = cv2.bilateralFilter(gray, 9, 75, 75)
    
    # Sharpening para realçar detalhes
    kernel = np.array([[-1,-1,-1],
                       [-1, 9,-1],
                       [-1,-1,-1]])
    sharpened = cv2.filter2D(denoised, -1, kernel)
    
    return sharpened

def extract_sift_features(image_buffer):
    """
    Extrai características SIFT de uma imagem de impressão digital
    
    Args:
        image_buffer: Buffer da imagem em bytes
        
    Returns:
        dict: Dicionário contendo keypoints e descritores serializados
    """
    try:
        # Decodifica a imagem do buffer
        nparr = np.frombuffer(image_buffer, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
        
        if image is None:
            raise ValueError("Não foi possível decodificar a imagem")
        
        # Pré-processa a imagem
        processed = preprocess_fingerprint(image)
        
        # Cria o detector SIFT
        # nfeatures: número máximo de features a detectar
        # contrastThreshold: threshold para filtrar features fracas
        # edgeThreshold: threshold para filtrar features em bordas
        sift = cv2.SIFT_create(
            nfeatures=500,
            contrastThreshold=0.04,
            edgeThreshold=10,
            sigma=1.6
        )
        
        # Detecta keypoints e computa descritores
        keypoints, descriptors = sift.detectAndCompute(processed, None)
        
        if descriptors is None or len(keypoints) == 0:
            raise ValueError("Nenhuma característica foi detectada na imagem")
        
        # Serializa os keypoints (convertendo para formato JSON-friendly)
        keypoints_serialized = []
        for kp in keypoints:
            keypoints_serialized.append({
                'pt': [float(kp.pt[0]), float(kp.pt[1])],
                'size': float(kp.size),
                'angle': float(kp.angle),
                'response': float(kp.response),
                'octave': int(kp.octave),
                'class_id': int(kp.class_id)
            })
        
        # Converte descritores para lista (são arrays numpy)
        descriptors_list = descriptors.tolist()
        
        return {
            'success': True,
            'keypoints': keypoints_serialized,
            'descriptors': descriptors_list,
            'num_features': len(keypoints)
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def compare_sift_features(template1, template2):
    """
    Compara dois templates SIFT e retorna um score de similaridade
    
    Args:
        template1: Primeiro template (dict com keypoints e descriptors)
        template2: Segundo template (dict com keypoints e descriptors)
        
    Returns:
        dict: Score de similaridade e número de matches
    """
    try:
        # Reconstrói os descritores como arrays numpy
        desc1 = np.array(template1['descriptors'], dtype=np.float32)
        desc2 = np.array(template2['descriptors'], dtype=np.float32)
        
        # Cria o matcher FLANN (Fast Library for Approximate Nearest Neighbors)
        FLANN_INDEX_KDTREE = 1
        index_params = dict(algorithm=FLANN_INDEX_KDTREE, trees=5)
        search_params = dict(checks=50)
        flann = cv2.FlannBasedMatcher(index_params, search_params)
        
        # Encontra os 2 melhores matches para cada descritor
        matches = flann.knnMatch(desc1, desc2, k=2)
        
        # Aplica o teste de razão de Lowe para filtrar bons matches
        good_matches = []
        for match_pair in matches:
            if len(match_pair) == 2:
                m, n = match_pair
                # Se a distância do melhor match é significativamente menor que o segundo
                if m.distance < 0.7 * n.distance:
                    good_matches.append(m)
        
        # Calcula o score de similaridade
        # Normaliza pelo número mínimo de features entre as duas imagens
        min_features = min(len(desc1), len(desc2))
        
        if min_features == 0:
            similarity_score = 0.0
        else:
            similarity_score = len(good_matches) / min_features
        
        return {
            'success': True,
            'similarity': float(similarity_score),
            'good_matches': len(good_matches),
            'total_matches': len(matches),
            'features_template1': len(desc1),
            'features_template2': len(desc2)
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def main():
    """
    Função principal que processa comandos da linha de comando
    """
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'Comando não especificado'}))
        sys.exit(1)
    
    command = sys.argv[1]
    
    try:
        if command == 'extract':
            # Lê a imagem da stdin em base64
            image_base64 = sys.stdin.read().strip()
            image_buffer = base64.b64decode(image_base64)
            
            result = extract_sift_features(image_buffer)
            print(json.dumps(result))
            
        elif command == 'compare':
            # Lê os dois templates da stdin em JSON
            input_data = json.loads(sys.stdin.read())
            template1 = input_data['template1']
            template2 = input_data['template2']
            
            result = compare_sift_features(template1, template2)
            print(json.dumps(result))
            
        else:
            print(json.dumps({'success': False, 'error': f'Comando desconhecido: {command}'}))
            sys.exit(1)
            
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    main()