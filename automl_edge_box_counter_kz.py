# ==============================================================================
# AutoML Vision Edge Box Counter with ByteTrack (KZ)
# Source: OZAT Engineering Blog (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/automl_edge_box_counter_kz.py
# ==============================================================================

import cv2
import numpy as np
import time
from typing import List, Dict, Tuple

# Edge TPU / NNAPI үдеткіші бар TFLite моделін жүктеу
try:
    import tflite_runtime.interpreter as tflite
except ImportError:
    import tensorflow.lite as tflite

class WarehouseEdgeBoxDetector:
    """
    AutoML Vision Edge (INT8 Кванттау) моделі негізінде қоймадағы қораптарды
    смартфонда локалды оптикалық санау және қадағалау класы.
    """
    def __init__(self, model_path: str = "automl_box_detector_int8.tflite", conf_threshold: float = 0.65, iou_threshold: float = 0.45):
        # NPU делегатын қолдайтын TFLite Interpreter баптау
        self.interpreter = tflite.Interpreter(model_path=model_path, num_threads=4)
        self.interpreter.allocate_tensors()
        
        self.input_details = self.interpreter.get_input_details()
        self.output_details = self.interpreter.get_output_details()
        self.input_shape = self.input_details[0]['shape'] # [1, 384, 384, 3]
        
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        
        # Қораптарды қайталап санауды болдырмайтын центроидтар тізілімі (ByteTrack Lite)
        self.tracked_boxes: Dict[int, Tuple[float, float, int]] = {} # id -> (cx, cy, last_seen_frame)
        self.next_box_id = 1
        self.total_counted_boxes = set()

    def preprocess(self, frame: np.ndarray) -> np.ndarray:
        """384x384 тензорына бейімдеу және INT8 кванттауды өңдеу"""
        h, w, _ = frame.shape
        resized = cv2.resize(frame, (self.input_shape[1], self.input_shape[2]))
        
        if self.input_details[0]['dtype'] == np.uint8:
            input_data = np.expand_dims(resized, axis=0).astype(np.uint8)
        else:
            input_data = (np.expand_dims(resized, axis=0).astype(np.float32) - 127.5) / 127.5
            
        return input_data

    def detect_boxes(self, frame: np.ndarray) -> List[Dict]:
        """Non-Maximum Suppression (NMS) және пиксельдік бокстарды есептеу инференсі"""
        orig_h, orig_w, _ = frame.shape
        input_data = self.preprocess(frame)
        
        self.interpreter.set_tensor(self.input_details[0]['index'], input_data)
        t_start = time.perf_counter()
        self.interpreter.invoke()
        inference_time_ms = (time.perf_counter() - t_start) * 1000
        
        raw_boxes = self.interpreter.get_tensor(self.output_details[0]['index'])[0] # [ymin, xmin, ymax, xmax]
        raw_classes = self.interpreter.get_tensor(self.output_details[1]['index'])[0]
        raw_scores = self.interpreter.get_tensor(self.output_details[2]['index'])[0]
        
        detected_boxes = []
        for i in range(len(raw_scores)):
            score = float(raw_scores[i])
            if score >= self.conf_threshold:
                ymin, xmin, ymax, xmax = raw_boxes[i]
                abs_box = [
                    int(ymin * orig_h),
                    int(xmin * orig_w),
                    int(ymax * orig_h),
                    int(xmax * orig_w)
                ]
                cx = (abs_box[1] + abs_box[3]) / 2.0
                cy = (abs_box[0] + abs_box[2]) / 2.0
                
                detected_boxes.append({
                    "box": abs_box,
                    "score": score,
                    "centroid": (cx, cy),
                    "class_id": int(raw_classes[i])
                })
                
        return detected_boxes

    def update_tracking(self, detections: List[Dict], frame_idx: int) -> int:
        """Центроидтарды сәйкестендіру және бірегей қораптардың санын жаңарту"""
        current_centroids = [d["centroid"] for d in detections]
        
        for cx, cy in current_centroids:
            matched_id = None
            min_dist = float('inf')
            
            for box_id, (tcx, tcy, _) in list(self.tracked_boxes.items()):
                dist = np.hypot(cx - tcx, cy - tcy)
                if dist < 45.0 and dist < min_dist:
                    min_dist = dist
                    matched_id = box_id
                    
            if matched_id is not None:
                self.tracked_boxes[matched_id] = (cx, cy, frame_idx)
            else:
                new_id = self.next_box_id
                self.next_box_id += 1
                self.tracked_boxes[new_id] = (cx, cy, frame_idx)
                self.total_counted_boxes.add(new_id)
                
        dead_ids = [bid for bid, (_, _, last_seen) in self.tracked_boxes.items() if frame_idx - last_seen > 30]
        for bid in dead_ids:
            del self.tracked_boxes[bid]
            
        return len(self.total_counted_boxes)
