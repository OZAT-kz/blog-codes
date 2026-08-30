# ==============================================================================
# Warehouse Box Detection & MOT Tracking (Vertex AI Edge / Python - KZ)
# Source: OZAT Engineering Hub (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/automl_edge_box_counter_kz.py
# ==============================================================================

"""
Қоймадағы қораптарды оптикалық локалды анықтау және қадағалаудың өндірістік контуры.
Мобильді процессор мен NPU чипінде Google AI Edge LiteRT (TensorFlow Lite) арқылы жұмыс істейді.
OZAT инженерлік зертханасы (https://ozat.kz) әзірлеген.
"""

import cv2
import numpy as np
import time
from typing import List, Dict, Tuple, Optional, Set

try:
    import tflite_runtime.interpreter as tflite
except ImportError:
    try:
        import tensorflow.lite as tflite
    except ImportError:
        raise ImportError("Құрылғыда инференс жасау үшін tflite_runtime немесе tensorflow.lite кітапханасы қажет.")


class TrackedObject:
    """Камераның көру аймағындағы жеке қадағаланатын нысанның күйі."""
    def __init__(self, obj_id: int, centroid: Tuple[float, float], bbox: List[int], frame_idx: int):
        self.obj_id: int = obj_id
        self.centroid: Tuple[float, float] = centroid
        self.bbox: List[int] = bbox  # [ymin, xmin, ymax, xmax] пиксельдер бойынша
        self.first_seen_frame: int = frame_idx
        self.last_seen_frame: int = frame_idx
        self.hits: int = 1
        self.velocity: Tuple[float, float] = (0.0, 0.0)  # Бір кадрдағы жылдамдық векторлары (vx, vy)
        self.confirmed: bool = False


class WarehouseEdgeBoxDetector:
    """
    Vertex AI Edge (LiteRT / INT8) негізіндегі қоймалық қораптарды детекторлау және трекингтеу жүйесі.
    Бейнеағынды бұлтқа жібермей-ақ мобильді құрылғыларда 30+ FPS жылдамдықты қамтамасыз етеді.
    """
    def __init__(
        self,
        model_path: str = "vertex_edge_box_detector_int8.tflite",
        conf_threshold: float = 0.60,
        iou_threshold: float = 0.45,
        use_nnapi: bool = True,
        max_disappeared_frames: int = 25,
        min_hits_to_confirm: int = 3
    ):
        delegates = []
        if use_nnapi:
            try:
                # Android-та NNAPI Delegate (NPU аппараттық үдеткішін) іске қосу
                nnapi_delegate = tflite.load_delegate('libneuralnetworks.so')
                delegates.append(nnapi_delegate)
                print("[OZAT-Vision] NNAPI Delegate (NPU) аппараттық үдеткіші сәтті қосылды.")
            except Exception as exc:
                print(f"[OZAT-Vision] NNAPI Delegate қосылмады ({exc}), 4-ағынды CPU-ға ауысу.")

        self.interpreter = tflite.Interpreter(
            model_path=model_path,
            experimental_delegates=delegates,
            num_threads=4
        )
        self.interpreter.allocate_tensors()

        self.input_details = self.interpreter.get_input_details()
        self.output_details = self.interpreter.get_output_details()
        self.input_shape = self.input_details[0]['shape']  # Мысалы: [1, 384, 384, 3]
        self.input_dtype = self.input_details[0]['dtype']

        # INT8 квантталған моделі үшін параметрлер
        self.is_quantized = self.input_dtype == np.uint8 or self.input_dtype == np.int8
        self.input_scale, self.input_zero_point = self.input_details[0].get('quantization', (1.0, 0))

        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.max_disappeared_frames = max_disappeared_frames
        self.min_hits_to_confirm = min_hits_to_confirm

        self.tracked_objects: Dict[int, TrackedObject] = {}
        self.next_obj_id: int = 1
        self.total_counted_set: Set[int] = set()

    def preprocess(self, frame_bgr: np.ndarray) -> np.ndarray:
        """Кадрды дайындау: түс кеңістігін түрлендіру және тензорды кванттау."""
        rgb_frame = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        target_h, target_w = self.input_shape[1], self.input_shape[2]
        resized = cv2.resize(rgb_frame, (target_w, target_h), interpolation=cv2.INTER_LINEAR)

        if self.is_quantized:
            if self.input_dtype == np.uint8:
                return np.expand_dims(resized, axis=0).astype(np.uint8)
            else:
                quantized = (resized.astype(np.float32) / self.input_scale) + self.input_zero_point
                return np.expand_dims(np.clip(quantized, -128, 127), axis=0).astype(np.int8)
        else:
            normalized = (resized.astype(np.float32) - 127.5) / 127.5
            return np.expand_dims(normalized, axis=0).astype(np.float32)

    def detect_boxes(self, frame_bgr: np.ndarray) -> List[Dict]:
        """LiteRT моделінің сенімділік шегі бойынша жергілікті инференсі."""
        orig_h, orig_w, _ = frame_bgr.shape
        input_tensor = self.preprocess(frame_bgr)

        self.interpreter.set_tensor(self.input_details[0]['index'], input_tensor)
        self.interpreter.invoke()

        boxes = self.interpreter.get_tensor(self.output_details[0]['index'])[0]
        classes = self.interpreter.get_tensor(self.output_details[1]['index'])[0]
        scores = self.interpreter.get_tensor(self.output_details[2]['index'])[0]

        detections = []
        for i in range(len(scores)):
            score = float(scores[i])
            if score >= self.conf_threshold:
                ymin, xmin, ymax, xmax = boxes[i]
                abs_box = [
                    int(ymin * orig_h),
                    int(xmin * orig_w),
                    int(ymax * orig_h),
                    int(xmax * orig_w)
                ]
                cx = (abs_box[1] + abs_box[3]) / 2.0
                cy = (abs_box[0] + abs_box[2]) / 2.0
                detections.append({
                    "box": abs_box,
                    "score": score,
                    "class_id": int(classes[i]),
                    "centroid": (cx, cy)
                })

        return detections

    def update_tracking(self, detections: List[Dict], frame_idx: int) -> int:
        """
        Жылдамдықты бағалау және қайта санаудан (Double-Counting) қорғау трекингі.
        Анықталған бірегей қораптардың нақты жалпы санын қайтарады.
        """
        curr_centroids = [d["centroid"] for d in detections]
        used_detection_indices = set()
        matched_track_ids = set()

        # 1. Жылдамдық болжамы арқылы белсенді тректермен сәйкестендіру
        for obj_id, track in list(self.tracked_objects.items()):
            pred_cx = track.centroid[0] + track.velocity[0]
            pred_cy = track.centroid[1] + track.velocity[1]

            best_idx = None
            min_dist = float('inf')
            max_gate_dist = max(55.0, np.hypot(track.velocity[0], track.velocity[1]) * 1.8 + 35.0)

            for i, (cx, cy) in enumerate(curr_centroids):
                if i in used_detection_indices:
                    continue
                dist = np.hypot(cx - pred_cx, cy - pred_cy)
                if dist < max_gate_dist and dist < min_dist:
                    min_dist = dist
                    best_idx = i

            if best_idx is not None:
                new_cx, new_cy = curr_centroids[best_idx]
                dt = max(1, frame_idx - track.last_seen_frame)
                track.velocity = ((new_cx - track.centroid[0]) / dt, (new_cy - track.centroid[1]) / dt)
                track.centroid = (new_cx, new_cy)
                track.bbox = detections[best_idx]["box"]
                track.last_seen_frame = frame_idx
                track.hits += 1

                if track.hits >= self.min_hits_to_confirm and not track.confirmed:
                    track.confirmed = True
                    self.total_counted_set.add(obj_id)

                used_detection_indices.add(best_idx)
                matched_track_ids.add(obj_id)

        # 2. Жаңа трек кандидаттарын тіркеу
        for i, det in enumerate(detections):
            if i not in used_detection_indices:
                new_track = TrackedObject(
                    obj_id=self.next_obj_id,
                    centroid=det["centroid"],
                    bbox=det["box"],
                    frame_idx=frame_idx
                )
                self.tracked_objects[self.next_obj_id] = new_track
                self.next_obj_id += 1

        # 3. Экраннан шығып кеткен тректерді жадтан тазарту
        for obj_id, track in list(self.tracked_objects.items()):
            if frame_idx - track.last_seen_frame > self.max_disappeared_frames:
                del self.tracked_objects[obj_id]

        return len(self.total_counted_set)


if __name__ == "__main__":
    detector = WarehouseEdgeBoxDetector()
    cap = cv2.VideoCapture(0)
    frame_count = 0

    print("[OZAT-Vision] Мобильді инспекция ағыны қосылды. Тоқтату үшін 'q' басыңыз.")
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame_count += 1
        t0 = time.perf_counter()
        detections = detector.detect_boxes(frame)
        total_boxes = detector.update_tracking(detections, frame_count)
        latency_ms = (time.perf_counter() - t0) * 1000.0

        for det in detections:
            ymin, xmin, ymax, xmax = det["box"]
            cv2.rectangle(frame, (xmin, ymin), (xmax, ymax), (0, 255, 0), 2)

        cv2.putText(
            frame,
            f"Саналған қораптар: {total_boxes} | Кідіріс: {latency_ms:.1f}мс ({1000.0/latency_ms:.1f} FPS)",
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (0, 255, 255),
            2
        )

        cv2.imshow("OZAT Warehouse Edge Inspection", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
