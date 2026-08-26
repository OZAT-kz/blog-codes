# ==============================================================================
# Бір үзіліс кезіндегі түгендеу: Смартфон, Vertex AI Edge (LiteRT / TFLite) және Cloud Firestore арқылы 5 000 қорапты қалай санаймыз
# Source: OZAT Engineering Blog (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/warehouse_inventory_litert_tracker_kz.py
# ==============================================================================

import time
import math
import numpy as np
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Dict, Tuple, Optional

# Google AI Edge LiteRT (formerly TensorFlow Lite Runtime)
try:
    import ai_edge_litert.interpreter as litert
except ImportError:
    import tflite_runtime.interpreter as litert


class TrackState(Enum):
    TENTATIVE = "TENTATIVE"    # Initial detection phase (< 3 consecutive hits)
    CONFIRMED = "CONFIRMED"    # Confirmed object (>= 3 hits), counter incremented
    LOST = "LOST"              # Temporarily occluded / out-of-frame (kept up to 25 frames)
    DELETED = "DELETED"        # Expired track, cleaned from memory


@dataclass
class BoundingBox:
    ymin: float
    xmin: float
    ymax: float
    xmax: float
    score: float
    class_id: int

    @property
    def centroid(self) -> Tuple[float, float]:
        """Calculates centroid C_k = ((xmin + xmax)/2, (ymin + ymax)/2) in pixel space."""
        return ((self.xmin + self.xmax) / 2.0, (self.ymin + self.ymax) / 2.0)


@dataclass
class Track:
    track_id: int
    centroid: Tuple[float, float]
    velocity: Tuple[float, float] = (0.0, 0.0)  # (vx, vy) in pixels/sec
    last_timestamp: float = field(default_factory=time.time)
    hits: int = 1
    misses: int = 0
    state: TrackState = TrackState.TENTATIVE
    is_counted: bool = False

    def predict_position(self, current_time: float) -> Tuple[float, float]:
        """Predicts position based on velocity: x_pred = x + vx * dt, y_pred = y + vy * dt."""
        dt = max(current_time - self.last_timestamp, 1e-4)
        return (
            self.centroid[0] + self.velocity[0] * dt,
            self.centroid[1] + self.velocity[1] * dt
        )

    def update(self, new_centroid: Tuple[float, float], current_time: float):
        """Updates track centroid, velocity, and state machine."""
        dt = max(current_time - self.last_timestamp, 1e-4)
        vx = (new_centroid[0] - self.centroid[0]) / dt
        vy = (new_centroid[1] - self.centroid[1]) / dt
        
        alpha = 0.6
        self.velocity = (
            alpha * vx + (1.0 - alpha) * self.velocity[0],
            alpha * vy + (1.0 - alpha) * self.velocity[1]
        )
        self.centroid = new_centroid
        self.last_timestamp = current_time
        self.hits += 1
        self.misses = 0

        if self.state == TrackState.TENTATIVE and self.hits >= 3:
            self.state = TrackState.CONFIRMED


class LiteRTBoxDetector:
    """LiteRT INT8 Object Detector with Hardware Acceleration Delegate."""

    def __init__(self, model_path: str = "models/warehouse_boxes_int8.tflite", use_nnapi: bool = True):
        delegates = []
        if use_nnapi:
            try:
                nnapi_delegate = litert.load_delegate("libnnapi_delegate.so")
                delegates.append(nnapi_delegate)
            except Exception as err:
                print(f"[WARN] NNAPI Delegate unavailable, falling back to multi-core CPU: {err}")

        self.interpreter = litert.Interpreter(
            model_path=model_path,
            experimental_delegates=delegates,
            num_threads=4
        )
        self.interpreter.allocate_tensors()
        
        self.input_details = self.interpreter.get_input_details()
        self.output_details = self.interpreter.get_output_details()
        self.input_shape = self.input_details[0]['shape']

    def infer(self, frame_rgb: np.ndarray, score_threshold: float = 0.55) -> List[BoundingBox]:
        input_data = np.expand_dims(frame_rgb, axis=0)
        if self.input_details[0]['dtype'] == np.uint8:
            input_tensor = input_data.astype(np.uint8)
        else:
            input_tensor = (input_data / 255.0).astype(np.float32)

        self.interpreter.set_tensor(self.input_details[0]['index'], input_tensor)
        self.interpreter.invoke()

        boxes = self.interpreter.get_tensor(self.output_details[0]['index'])[0]
        classes = self.interpreter.get_tensor(self.output_details[1]['index'])[0]
        scores = self.interpreter.get_tensor(self.output_details[2]['index'])[0]

        detected_boxes: List[BoundingBox] = []
        for i in range(len(scores)):
            if scores[i] >= score_threshold:
                detected_boxes.append(BoundingBox(
                    ymin=float(boxes[i][0]),
                    xmin=float(boxes[i][1]),
                    ymax=float(boxes[i][2]),
                    xmax=float(boxes[i][3]),
                    score=float(scores[i]),
                    class_id=int(classes[i])
                ))
        return detected_boxes


class WarehouseCentroidTracker:
    """Anti-Double Counting Centroid Tracker with State Machine & Dynamic Gating."""

    def __init__(self, max_missed_frames: int = 25):
        self.next_track_id = 1
        self.tracks: Dict[int, Track] = {}
        self.max_missed_frames = max_missed_frames
        self.total_unique_boxes_counted = 0

    def update(self, detections: List[BoundingBox], frame_width: int, frame_height: int) -> int:
        current_time = time.time()
        centroids = [
            (box.centroid[0] * frame_width, box.centroid[1] * frame_height)
            for box in detections
        ]

        if not self.tracks:
            for c in centroids:
                self._register_track(c, current_time)
            return self.total_unique_boxes_counted

        track_ids = list(self.tracks.keys())
        predicted_positions = [self.tracks[tid].predict_position(current_time) for tid in track_ids]

        assigned_tracks = set()
        assigned_centroids = set()

        if centroids and predicted_positions:
            dist_matrix = np.zeros((len(track_ids), len(centroids)), dtype=np.float32)
            for i, p_pos in enumerate(predicted_positions):
                for j, c in enumerate(centroids):
                    dist_matrix[i, j] = math.hypot(p_pos[0] - c[0], p_pos[1] - c[1])

            row_indices = np.argsort(dist_matrix.min(axis=1))
            for r in row_indices:
                tid = track_ids[r]
                track = self.tracks[tid]
                speed = math.hypot(track.velocity[0], track.velocity[1])
                dynamic_gate = max(55.0, speed * 1.8 + 35.0)

                col = np.argmin(dist_matrix[r])
                if col not in assigned_centroids and dist_matrix[r, col] <= dynamic_gate:
                    track.update(centroids[col], current_time)
                    if track.state == TrackState.CONFIRMED and not track.is_counted:
                        track.is_counted = True
                        self.total_unique_boxes_counted += 1
                    assigned_tracks.add(tid)
                    assigned_centroids.add(col)

        for tid in track_ids:
            if tid not in assigned_tracks:
                self.tracks[tid].misses += 1
                self.tracks[tid].state = TrackState.LOST
                if self.tracks[tid].misses > self.max_missed_frames:
                    self.tracks[tid].state = TrackState.DELETED
                    del self.tracks[tid]

        for j, c in enumerate(centroids):
            if j not in assigned_centroids:
                self._register_track(c, current_time)

        return self.total_unique_boxes_counted

    def _register_track(self, centroid: Tuple[float, float], current_time: float):
        self.tracks[self.next_track_id] = Track(
            track_id=self.next_track_id,
            centroid=centroid,
            last_timestamp=current_time,
            state=TrackState.TENTATIVE
        )
        self.next_track_id += 1
