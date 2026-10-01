import React from 'react';

export default function PixelRoom() {
  return <div className="room" aria-hidden="true">
    <img className="room-background" src={`${import.meta.env.BASE_URL}art/night-room.webp`} alt="" draggable="false" />
    <div className="lamp-glow" />
    <div className="vinyl-plane"><svg className="vinyl-svg" viewBox="0 0 100 100" preserveAspectRatio="none" shapeRendering="crispEdges"><g className="vinyl">
      <circle cx="50" cy="50" r="49" fill="#090d15" stroke="#243042" strokeWidth="1" />
      {[44, 40, 36, 32, 28, 24].map((r) => <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="#172030" strokeWidth=".6" />)}
      <path d="M14 34a39 39 0 0 1 18-18M68 84a39 39 0 0 0 18-18" stroke="#425065" opacity=".5" fill="none" strokeWidth="2" />
      <circle cx="50" cy="50" r="16" fill="#c9a372" />
      <circle cx="50" cy="50" r="13" fill="none" stroke="#87623d" strokeWidth=".6" />
      <path d="M44 43h12v2H44zm-2 13h16v2H42z" fill="#795434" />
      <circle cx="50" cy="50" r="2.6" fill="#141c27" />
      <path d="m49 48 1-2 1 2v4h-2Z" fill="#ded5ba" />
    </g></svg></div>
    <svg className="tonearm-layer" viewBox="0 0 1536 1024" preserveAspectRatio="none" shapeRendering="crispEdges">
      <circle cx="1017" cy="591" r="17" fill="#121923" stroke="#929bad" strokeWidth="5" />
      <g className="tonearm">
        <path d="M1017 591 1045 652 1087 740" fill="none" stroke="#080b11" strokeWidth="22" />
        <path d="M1017 591 1045 652 1087 740" fill="none" stroke="#b5b7b4" strokeWidth="12" />
        <path d="M1017 591 1045 652 1087 740" fill="none" stroke="#e4d2ae" strokeWidth="3" />
        <path d="m1074 725 27-11 13 33-27 12Z" fill="#566173" stroke="#111722" strokeWidth="5" />
        <path d="m1089 746 15-6 3 7-15 6Z" fill="#a85240" />
      </g>
    </svg>
    <div className="room-caption"><span className="room-light" /> YOUR LITTLE LISTENING ROOM</div>
  </div>;
}
