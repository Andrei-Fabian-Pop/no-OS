/***************************************************************************//**
 *   @file   common_data.c
 *   @brief  Common data for SDP-K1 + AD5592R demo.
 *   @author Demo Project
********************************************************************************
 * Copyright 2024(c) Analog Devices, Inc.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * 3. Neither the name of Analog Devices, Inc. nor the names of its
 *    contributors may be used to endorse or promote products derived from this
 *    software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY ANALOG DEVICES, INC. "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO
 * EVENT SHALL ANALOG DEVICES, INC. BE LIABLE FOR ANY DIRECT, INDIRECT,
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 * OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 * EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*******************************************************************************/

#include "common_data.h"
#include "stm32_spi.h"
#include "stm32_uart.h"

/* UART extra parameters for STM32 */
struct stm32_uart_init_param uart_extra_ip = {
	.huart = NULL,
};

/* UART configuration */
struct no_os_uart_init_param uart_ip = {
	.device_id = 5,
	.irq_id = 0,
	.asynchronous_rx = false,
	.baud_rate = 115200,
	.size = NO_OS_UART_CS_8,
	.parity = NO_OS_UART_PAR_NO,
	.stop = NO_OS_UART_STOP_1_BIT,
	.platform_ops = &stm32_uart_ops,
	.extra = &uart_extra_ip,
};

/* SPI extra parameters for STM32 */
struct stm32_spi_init_param spi_extra_ip = {
	.chip_select_port = 0,
	.get_input_clock = NULL,
};

/* SPI configuration - SPI1 on SDP-K1 */
struct no_os_spi_init_param spi_ip = {
	.device_id = 1,
	.max_speed_hz = 1000000,
	.chip_select = 0,
	.mode = NO_OS_SPI_MODE_0,
	.bit_order = NO_OS_SPI_BIT_ORDER_MSB_FIRST,
	.platform_ops = &stm32_spi_ops,
	.extra = &spi_extra_ip,
};

/* AD5592R initialization parameters */
struct ad5592r_init_param ad5592r_ip = {
	.int_ref = true,
	.spi_init = &spi_ip,
	.i2c_init = NULL,
	.ss_init = NULL,
	.channel_modes = {
		CH_MODE_DAC,      /* IO0 - DAC output */
		CH_MODE_DAC,      /* IO1 - DAC output */
		CH_MODE_DAC,      /* IO2 - DAC output */
		CH_MODE_DAC,      /* IO3 - DAC output */

		CH_MODE_ADC,      /* IO4 - ADC input */
		CH_MODE_ADC,      /* IO5 - ADC input */
		CH_MODE_ADC,      /* IO6 - ADC input */
		CH_MODE_ADC,      /* IO7 - ADC input */
	},
	.channel_offstate = {
		CH_OFFSTATE_PULLDOWN,
		CH_OFFSTATE_PULLDOWN,
		CH_OFFSTATE_PULLDOWN,
		CH_OFFSTATE_PULLDOWN,
		CH_OFFSTATE_PULLDOWN,
		CH_OFFSTATE_PULLDOWN,
		CH_OFFSTATE_PULLDOWN,
		CH_OFFSTATE_PULLDOWN,
	},
	.adc_range = ZERO_TO_VREF,
	.dac_range = ZERO_TO_VREF,
	.adc_buf = true,
	.power_down = {0, 0, 0, 0, 0, 0, 0, 0},
};
