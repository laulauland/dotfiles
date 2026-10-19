" MSL extends C++ with GPU entry points, address spaces, types, and attributes.
" Use regex syntax rather than parsing Metal as C++ and misreading its extensions.
if exists('b:current_syntax')
  finish
endif
runtime! syntax/cpp.vim
unlet! b:current_syntax

syntax keyword metalKeyword kernel vertex fragment device constant thread threadgroup threadgroup_imageblock ray_data object_data mesh object
syntax keyword metalType uint ushort uchar half packed_float2 packed_float3 packed_float4 packed_half2 packed_half3 packed_half4
syntax match metalType '\<\%(bool\|char\|uchar\|short\|ushort\|int\|uint\|long\|ulong\|half\|float\)[234]\%(x[234]\)\?\>'
syntax match metalType '\<\%(texture\w*\|depth\w*\|sampler\|atomic_\w*\|simdgroup_\w*\)\>'
syntax region metalAttribute start='\[\[' end='\]\]' contains=cppNumber
syntax keyword metalBuiltin threadgroup_barrier simdgroup_barrier simd_sum simd_shuffle simd_shuffle_down simd_shuffle_up simd_broadcast simdgroup_load simdgroup_store simdgroup_multiply_accumulate

highlight default link metalKeyword Keyword
highlight default link metalType Type
highlight default link metalAttribute PreProc
highlight default link metalBuiltin Function
let b:current_syntax = 'metal'
